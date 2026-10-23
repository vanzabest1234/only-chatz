import { q } from './db.js'
import { randomInt } from 'node:crypto'
import { destroyUserSessions } from './auth.js'
import { disconnectUser, emitAll, emitTo } from './realtime.js'
import { ASSIGNABLE_ROLES, rankOf, labelFor, roleForRank } from './roles.js'
import { CUSTOM_FLAIR, FLAIR_KEYS, FLAIRS, MAX_EQUIPPED, ensureCustomTag } from './flairs.js'
import { OWNER_HOURS, completePass } from './pass.js'
import { audit, cleanText } from './guard.js'
import { checkDisplayName } from './names.js'
import { publicMessage } from './serializers.js'
import { accrueCoins, grantCoins, settleBet, spendCoins, topWallets } from './coins.js'
import { MAX_BET, MIN_BET, gambleRoll, rollDice } from './casino.js'
import { answerAi } from './ai.js'

async function postSystem(channel, content) {
  const { rows } = await q(
    `INSERT INTO messages (channel_id, author_name, author_role, content, system)
     VALUES ($1, 'Only Chatz', 'system', $2, TRUE) RETURNING *`,
    [channel.id, content],
  )
  const message = publicMessage(rows[0])
  emitTo(`channel:${channel.id}`, 'message:new', message)
  return message
}

/**
 * Resolve `@who` to one person. The @username wins; a display name is only used when
 * exactly one account has it, so renaming yourself to someone else's display name can
 * never make a moderator act on the wrong account.
 */
async function findUser(token) {
  const name = cleanText(token, 64).replace(/^@/, '').trim()
  if (!name) return null

  const byUsername = await q('SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1', [name])
  if (byUsername.rows.length) return byUsername.rows[0]

  const byDisplay = await q('SELECT * FROM users WHERE lower(display_name) = lower($1) LIMIT 2', [name])
  if (byDisplay.rows.length > 1) return { ambiguous: name }
  return byDisplay.rows[0] ?? null
}

/** A single other account, for the commands that need no target of their own. */
async function randomOther(actorId) {
  const { rows } = await q(
    'SELECT display_name FROM users WHERE id <> $1 ORDER BY random() LIMIT 1',
    [actorId],
  )
  return rows[0] ?? null
}

function chemistryLine(score) {
  if (score >= 90) return 'soulmates, apparently.'
  if (score >= 70) return 'sparks are flying.'
  if (score >= 45) return 'a slow burn.'
  if (score >= 20) return 'friends, at best.'
  return 'absolutely nothing there.'
}

function guardTarget(actor, target) {
  if (!target) return 'I could not find that person.'
  if (target.ambiguous) return 'More than one person has that name — use their @username.'
  if (target.id === actor.id) return 'You cannot use that on yourself.'
  if (rankOf(target.role) >= rankOf(actor.role)) {
    return 'You cannot act on someone at or above your own rank.'
  }
  return null
}

// Lines the fortune commands hand out. The pick happens server-side like every other roll,
// and nothing about them is stored — each use is one system line in the room.
const EIGHT_BALL = [
  'it is certain.',
  'signs point to yes.',
  'ask again later.',
  'do not count on it.',
  'my reply is no.',
  'the console says yes.',
  'the output is unclear.',
]

const QUOTES = [
  'the cursor blinks whether or not you type.',
  'every packet is a small promise.',
  'nothing floats forever, not even a flag.',
  'the terminal remembers what you deleted.',
  'green is only a colour until it is status.',
]

const pick = list => list[randomInt(list.length)]

const FLAIR_LABELS = new Map(FLAIRS.map(flair => [flair.key, flair.label]))

const COMMANDS = [
  {
    name: 'help',
    usage: '/help',
    description: 'List the commands you can use.',
    minRank: 0,
    async run({ actor }) {
      const usable = COMMANDS.filter(c => rankOf(actor.role) >= c.minRank).map(c => c.usage)
      return { notice: `Commands for ${labelFor(actor.role)}: ${usable.join('  ·  ')}` }
    },
  },
  {
    name: 'nick',
    usage: '/nick <name>',
    description: 'Change your display name.',
    minRank: 0,
    async run({ actor, args }) {
      const named = await checkDisplayName(args.join(' '), actor.id)
      if (named.error) return { error: `${named.error} Usage: /nick <new display name>` }
      const name = named.name
      await q('UPDATE users SET display_name = $1 WHERE id = $2', [name, actor.id])
      emitAll('members:refresh')
      emitTo(`user:${actor.id}`, 'profile:update')
      return { notice: `${actor.display_name} is now known as ${name}.` }
    },
  },
  {
    name: 'topic',
    usage: '/topic <text>',
    description: 'Set the topic of this channel.',
    minRank: 1,
    async run({ actor, channel, args }) {
      const topic = cleanText(args.join(' '), 140).replace(/\s+/g, ' ').trim()
      await q('UPDATE channels SET topic = $1 WHERE id = $2', [topic, channel.id])
      emitAll('channels:refresh')
      return { notice: `${actor.display_name} set the topic to "${topic || 'none'}".` }
    },
  },
  {
    name: 'slowmode',
    usage: '/slowmode <seconds>',
    description: 'Limit how often people can post (0 turns it off).',
    minRank: 1,
    async run({ actor, channel, args }) {
      const seconds = Number(args[0] ?? 0)
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 300) {
        return { error: 'Usage: /slowmode <0-300 seconds>' }
      }
      await q('UPDATE channels SET slowmode = $1 WHERE id = $2', [Math.round(seconds), channel.id])
      emitAll('channels:refresh')
      return {
        notice: seconds
          ? `${actor.display_name} set slowmode to ${Math.round(seconds)}s.`
          : `${actor.display_name} turned slowmode off.`,
      }
    },
  },
  {
    name: 'clear',
    usage: '/clear <count>',
    description: 'Remove the most recent messages in this channel.',
    minRank: 1,
    async run({ actor, channel, args }) {
      const count = Math.min(Math.max(Number(args[0] ?? 10), 1), 100)
      if (!Number.isFinite(count)) return { error: 'Usage: /clear <1-100>' }
      await q(
        `DELETE FROM messages WHERE id IN (
           SELECT id FROM messages WHERE channel_id = $1 ORDER BY id DESC LIMIT $2
         )`,
        [channel.id, Math.round(count)],
      )
      audit('messages-cleared', { actor: actor.username, channel: channel.name, count: Math.round(count) })
      return {
        notice: `${actor.display_name} cleared the last ${Math.round(count)} messages.`,
        refresh: 'channel',
      }
    },
  },
  {
    name: 'mute',
    usage: '/mute @user <minutes> [reason]',
    description: 'Stop someone from posting for a while.',
    minRank: 1,
    async run({ actor, args }) {
      const target = await findUser(args[0])
      const problem = guardTarget(actor, target)
      if (problem) return { error: problem }
      const minutes = Math.min(Math.max(Number(args[1] ?? 10), 1), 10080)
      if (!Number.isFinite(minutes)) return { error: 'Usage: /mute @user <minutes> [reason]' }
      const reason = cleanText(args.slice(2).join(' '), 140).trim()
      await q(`UPDATE users SET muted_until = now() + ($1 || ' minutes')::interval WHERE id = $2`, [
        String(Math.round(minutes)),
        target.id,
      ])
      audit('muted', { actor: actor.username, target: target.username, minutes: Math.round(minutes) })
      emitAll('members:refresh')
      emitTo(`user:${target.id}`, 'profile:update')
      return {
        notice: `${target.display_name} was muted by ${actor.display_name} for ${Math.round(minutes)} min${
          reason ? ` — ${reason}` : ''
        }.`,
      }
    },
  },
  {
    name: 'unmute',
    usage: '/unmute @user',
    description: 'Let someone post again.',
    minRank: 1,
    async run({ actor, args }) {
      const target = await findUser(args[0])
      const problem = guardTarget(actor, target)
      if (problem) return { error: problem }
      await q('UPDATE users SET muted_until = NULL WHERE id = $1', [target.id])
      emitAll('members:refresh')
      emitTo(`user:${target.id}`, 'profile:update')
      return { notice: `${target.display_name} can speak again.` }
    },
  },
  {
    name: 'kick',
    usage: '/kick @user [reason]',
    description: 'Sign someone out and remove them from the server.',
    minRank: 2,
    async run({ actor, args }) {
      const target = await findUser(args[0])
      const problem = guardTarget(actor, target)
      if (problem) return { error: problem }
      const reason = cleanText(args.slice(1).join(' '), 140).trim()
      await destroyUserSessions(target.id)
      emitTo(`user:${target.id}`, 'session:revoke', {
        message: `You were kicked by ${actor.display_name}.${reason ? ` Reason: ${reason}` : ''}`,
      })
      // Sessions are gone, but an open socket would otherwise keep receiving events.
      disconnectUser(target.id)
      audit('kicked', { actor: actor.username, target: target.username })
      emitAll('members:refresh')
      return { notice: `${target.display_name} was kicked by ${actor.display_name}${reason ? ` — ${reason}` : ''}.` }
    },
  },
  {
    name: 'ban',
    usage: '/ban @user [reason]',
    description: 'Block someone from signing in again.',
    minRank: 2,
    async run({ actor, args }) {
      const target = await findUser(args[0])
      const problem = guardTarget(actor, target)
      if (problem) return { error: problem }
      const reason = cleanText(args.slice(1).join(' '), 140).trim()
      await q('UPDATE users SET banned = TRUE WHERE id = $1', [target.id])
      await destroyUserSessions(target.id)
      emitTo(`user:${target.id}`, 'session:revoke', {
        message: `You were banned by ${actor.display_name}.${reason ? ` Reason: ${reason}` : ''}`,
      })
      disconnectUser(target.id)
      audit('banned', { actor: actor.username, target: target.username })
      emitAll('members:refresh')
      return { notice: `${target.display_name} was banned by ${actor.display_name}${reason ? ` — ${reason}` : ''}.` }
    },
  },
  {
    name: 'unban',
    usage: '/unban @user',
    description: 'Let a banned person back in.',
    minRank: 2,
    async run({ actor, args }) {
      const target = await findUser(args[0])
      if (!target) return { error: 'I could not find that person.' }
      if (target.ambiguous) return { error: 'More than one person has that name — use their @username.' }
      if (!target.banned) return { error: `${target.display_name} is not banned.` }
      if (rankOf(target.role) >= rankOf(actor.role)) {
        return { error: 'You cannot act on someone at or above your own rank.' }
      }
      await q('UPDATE users SET banned = FALSE WHERE id = $1', [target.id])
      audit('unbanned', { actor: actor.username, target: target.username })
      emitAll('members:refresh')
      return { notice: `${target.display_name} was unbanned by ${actor.display_name}.` }
    },
  },
  {
    name: 'role',
    usage: '/role @user <role>',
    description: 'Owner only — give someone a role.',
    minRank: 4,
    async run({ actor, args }) {
      // Only the Owner hands out roles; everyone else stays a member.
      if (actor.role !== 'owner') return { error: 'Only the Owner can hand out roles.' }
      const target = await findUser(args[0])
      const problem = guardTarget(actor, target)
      if (problem) return { error: problem }
      const role = String(args[1] ?? '').toLowerCase().replace(/\s+/g, '-')
      if (!ASSIGNABLE_ROLES.includes(role)) {
        return { error: `Pick one of: ${ASSIGNABLE_ROLES.join(', ')}` }
      }
      if (rankOf(role) >= rankOf(actor.role)) {
        return { error: 'You can only hand out roles below your own.' }
      }
      await q('UPDATE users SET role = $1 WHERE id = $2', [role, target.id])
      audit('role-changed', { actor: actor.username, target: target.username, role })
      emitAll('members:refresh')
      emitTo(`user:${target.id}`, 'profile:update')
      return { notice: `${target.display_name} is now ${labelFor(role)}.` }
    },
  },
  {
    name: 'bread',
    usage: '/bread @user',
    description: 'Owner only — hand someone the bread flair (it is not on the wheel).',
    minRank: 4,
    async run({ actor, args }) {
      if (actor.role !== 'owner') return { error: 'Only the Owner can hand out bread.' }
      const target = await findUser(args[0])
      const problem = guardTarget(actor, target)
      if (problem) return { error: problem }
      await q(
        `INSERT INTO user_flairs (user_id, flair, equipped) VALUES ($1, 'bread', TRUE)
         ON CONFLICT (user_id, flair) DO NOTHING`,
        [target.id],
      )
      audit('flair-granted', { actor: actor.username, target: target.username, flair: 'bread' })
      emitAll('members:refresh')
      emitTo(`user:${target.id}`, 'profile:update')
      return { notice: `${target.display_name} got the bread.` }
    },
  },
  {
    name: 'flair',
    usage: '/flair <flair> @user',
    description: 'Owner only — hand someone a flair: a wheel one, bread or the custom tag.',
    minRank: 4,
    async run({ actor, args }) {
      if (actor.role !== 'owner') return { error: 'Only the Owner can hand out flairs.' }
      // `/flair @user <flair>` works too — the flair word is whichever one is known.
      const keyArg = args.find(arg => FLAIR_KEYS.has(arg.toLowerCase()))
      if (!keyArg) {
        return { error: `Pick one of: ${[...FLAIR_KEYS].join(', ')} — /flair <flair> @user` }
      }
      const key = keyArg.toLowerCase()
      const target = await findUser(args.find(arg => arg !== keyArg))
      const problem = guardTarget(actor, target)
      if (problem) return { error: problem }

      const { rows: worn } = await q(
        'SELECT count(*)::int AS n FROM user_flairs WHERE user_id = $1 AND equipped',
        [target.id],
      )
      const { rows } = await q(
        `INSERT INTO user_flairs (user_id, flair, equipped) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, flair) DO NOTHING RETURNING flair`,
        [target.id, key, (worn[0]?.n ?? 0) < MAX_EQUIPPED],
      )
      if (key === CUSTOM_FLAIR) await ensureCustomTag(target.id)

      audit('flair-granted', { actor: actor.username, target: target.username, flair: key })
      emitAll('members:refresh')
      emitTo(`user:${target.id}`, 'profile:update')
      const label = FLAIRS.find(item => item.key === key)?.label ?? key
      return {
        notice: rows.length
          ? `${target.display_name} now has ${label}.`
          : `${target.display_name} already had ${label}.`,
      }
    },
  },
  {
    name: 'pass',
    usage: '/pass @user',
    description: `Owner only — finish someone's season pass (${OWNER_HOURS} hours, every tier).`,
    minRank: 4,
    async run({ actor, args }) {
      if (actor.role !== 'owner') return { error: 'Only the Owner can hand out the pass.' }
      const target = await findUser(args[0])
      const problem = guardTarget(actor, target)
      if (problem) return { error: problem }

      const state = await completePass(target.id)
      if (!state) return { error: 'I could not finish that pass.' }
      audit('pass-completed', { actor: actor.username, target: target.username, tier: state.tier })
      emitTo(`user:${target.id}`, 'pass:update', state)
      return {
        notice: `${target.display_name} finished the season pass — tier ${state.tier} with ${OWNER_HOURS} hours in.`,
      }
    },
  },
  {
    name: 'steal',
    usage: '/steal @user',
    description: 'Try to lift a quarter of someone’s coins — you win it or you pay it.',
    minRank: 0,
    async run({ actor, args }) {
      const target = await findUser(args[0])
      if (!target) return { error: 'I could not find that person. Usage: /steal @user' }
      if (target.ambiguous) return { error: 'More than one person has that name — use their @username.' }
      if (target.id === actor.id) return { error: 'You cannot steal from yourself.' }
      if (target.role === 'owner') return { error: 'Owners are immune to stealing.' }

      // Both purses are brought up to date first, so the cut is taken from real coins.
      const mine = (await accrueCoins(actor.id)).state.coins
      const theirs = (await accrueCoins(target.id)).state.coins
      if (theirs < 1) return { error: `${target.display_name} has no coins to steal.` }
      const cut = Math.max(1, Math.floor(theirs / 4))

      if (rollDice(50).won) {
        const taken = await spendCoins(target.id, cut)
        if (!taken) return { error: `${target.display_name} slipped away with their coins.` }
        const state = await grantCoins(actor.id, cut)
        emitTo(`user:${target.id}`, 'coins:update', taken)
        if (state) emitTo(`user:${actor.id}`, 'coins:update', state)
        audit('coins-stolen', { actor: actor.username, target: target.username, amount: cut })
        return {
          notice: `${actor.display_name} picked ${target.display_name}’s pocket for ${cut.toLocaleString()} royal coins.`,
        }
      }

      const stake = Math.min(cut, mine)
      if (stake < 1) return { error: 'You have no coins to lose — come back with a purse.' }
      const paid = await spendCoins(actor.id, stake)
      if (!paid) return { error: 'The steal went wrong — try again.' }
      const state = await grantCoins(target.id, stake)
      emitTo(`user:${actor.id}`, 'coins:update', paid)
      if (state) emitTo(`user:${target.id}`, 'coins:update', state)
      audit('coins-stolen', { actor: actor.username, target: target.username, amount: -stake })
      return {
        notice: `${actor.display_name} fumbled the steal and handed ${target.display_name} ${stake.toLocaleString()} royal coins.`,
      }
    },
  },
  {
    name: 'punch',
    usage: '/punch @user',
    description: 'Silence someone for 60 seconds — only if you hold more coins than them.',
    minRank: 0,
    async run({ actor, args }) {
      const target = await findUser(args[0])
      if (!target) return { error: 'I could not find that person. Usage: /punch @user' }
      if (target.ambiguous) return { error: 'More than one person has that name — use their @username.' }
      if (target.id === actor.id) return { error: 'You cannot punch yourself.' }
      if (target.role === 'owner') return { error: 'Owners are immune to punches.' }

      const mine = (await accrueCoins(actor.id)).state.coins
      const theirs = (await accrueCoins(target.id)).state.coins
      if (theirs > mine) {
        return { error: `${target.display_name} holds more coins than you — you cannot punch them.` }
      }

      // Never shortens a longer mute: the later of the two moments wins.
      await q(
        `UPDATE users
            SET muted_until = GREATEST(now() + interval '60 seconds', COALESCE(muted_until, now()))
          WHERE id = $1`,
        [target.id],
      )
      emitTo(`user:${target.id}`, 'profile:update')
      audit('punched', { actor: actor.username, target: target.username })
      return { notice: `${actor.display_name} punched ${target.display_name} — silenced for 60 seconds.` }
    },
  },
  {
    name: 'crush',
    usage: '/crush',
    description: 'Check your chemistry with a random person.',
    minRank: 0,
    async run({ actor }) {
      const other = await randomOther(actor.id)
      if (!other) return { error: 'There is nobody else here to crush on yet.' }
      const score = randomInt(0, 101)
      return {
        notice: `${actor.display_name} ♥ ${other.display_name} — ${score}% chemistry, ${chemistryLine(score)}`,
      }
    },
  },
  {
    name: 'gamble',
    usage: '/gamble <amount>',
    description: 'Stake royal coins: win big, win small, lose small or lose big.',
    minRank: 0,
    async run({ actor, args }) {
      const wager = Math.floor(Number(args[0]))
      if (!Number.isFinite(wager) || wager < MIN_BET) {
        return { error: `Stake at least ${MIN_BET} coins. Usage: /gamble <amount>` }
      }
      if (wager > MAX_BET) {
        return { error: `The table caps a single stake at ${MAX_BET.toLocaleString()} coins.` }
      }

      await accrueCoins(actor.id)
      const outcome = gambleRoll()
      const payout = Math.floor(wager * outcome.multiplier)
      // Stake and payout move in one statement, so a refused stake rolls nothing.
      const state = await settleBet(actor.id, wager, payout)
      if (!state) return { error: `You need ${wager.toLocaleString()} coins to stake that.` }

      emitTo(`user:${actor.id}`, 'coins:update', state)
      audit('gambled', { actor: actor.username, wager, outcome: outcome.key, payout })
      const result = payout
        ? `${outcome.label} — ${payout.toLocaleString()} coins back`
        : `${outcome.label} — the whole stake is gone`
      return {
        notice: `${actor.display_name} gambled ${wager.toLocaleString()} royal coins: ${result}. Balance ${state.coins.toLocaleString()}.`,
      }
    },
  },
  {
    name: 'leaderboard',
    usage: '/leaderboard',
    description: 'Show the ten richest purses on the server.',
    minRank: 0,
    async run() {
      const leaders = await topWallets()
      if (!leaders.length) return { error: 'The ladder is empty — the drip needs a few minutes to fill a purse.' }
      const lines = leaders
        .map(person => `${person.rank}. ${person.displayName} ${person.coins.toLocaleString()}`)
        .join('  ·  ')
      return { notice: `Royal coin ladder — ${lines}` }
    },
  },
  {
    name: '8ball',
    usage: '/8ball <question>',
    description: 'Ask the ball a yes-or-no question and get its answer.',
    minRank: 0,
    async run({ actor, args }) {
      const question = cleanText(args.join(' '), 140).trim()
      if (!question) return { error: 'Ask the ball something. Usage: /8ball <question>' }
      return { notice: `${actor.display_name} asks "${question}" — ${pick(EIGHT_BALL)}` }
    },
  },
  {
    name: 'flip',
    usage: '/flip',
    description: 'Flip a royal coin: heads or tails.',
    minRank: 0,
    async run({ actor }) {
      const side = randomInt(2) === 0 ? 'heads' : 'tails'
      return { notice: `${actor.display_name} flipped a coin — ${side}.` }
    },
  },
  {
    name: 'roll',
    usage: '/roll [sides]',
    description: 'Roll a die — a d6 unless you name the sides.',
    minRank: 0,
    async run({ actor, args }) {
      const sides = args.length ? Math.floor(Number(args[0])) : 6
      if (!Number.isFinite(sides) || sides < 2 || sides > 1000) {
        return { error: 'A die needs between 2 and 1000 sides. Usage: /roll [sides]' }
      }
      return { notice: `${actor.display_name} rolled a d${sides} — ${randomInt(1, sides + 1)}.` }
    },
  },
  {
    name: 'quote',
    usage: '/quote',
    description: 'Draw a line from the console.',
    minRank: 0,
    async run({ actor }) {
      return { notice: `${actor.display_name} draws a line — ${pick(QUOTES)}` }
    },
  },
  {
    name: 'whois',
    usage: '/whois @user',
    description: 'Show a short card for someone: role, purse, flairs and join date.',
    minRank: 0,
    async run({ actor, args }) {
      const target = await findUser(args[0])
      if (!target) return { error: 'I could not find that person. Usage: /whois @user' }
      if (target.ambiguous) return { error: 'More than one person has that name — use their @username.' }

      const state = (await accrueCoins(target.id)).state
      const { rows } = await q(
        'SELECT flair FROM user_flairs WHERE user_id = $1 AND equipped = TRUE ORDER BY obtained_at',
        [target.id],
      )
      const worn = rows.map(row => (row.flair === CUSTOM_FLAIR
        ? target.custom_tag || 'custom tag'
        : FLAIR_LABELS.get(row.flair) ?? row.flair))
      const joined = new Date(target.created_at).toISOString().slice(0, 10)
      const extras = [
        labelFor(target.role),
        `${state.coins.toLocaleString()} royal coins`,
        `joined ${joined}`,
        worn.length ? `wears ${worn.join(', ')}` : 'no flairs on',
      ]
      if (target.pronouns) extras.splice(1, 0, target.pronouns)
      return { notice: `${target.display_name} (@${target.username}) · ${extras.join(' · ')}` }
    },
  },
  {
    name: 'stats',
    usage: '/stats',
    description: 'Your own numbers: coins, messages, flairs and pass tier.',
    minRank: 0,
    async run({ actor }) {
      const state = (await accrueCoins(actor.id)).state
      const counted = await q(
        `SELECT (SELECT count(*) FROM messages WHERE author_id = $1)::int AS messages,
                (SELECT count(*) FROM user_flairs WHERE user_id = $1)::int AS flairs`,
        [actor.id],
      )
      const { messages, flairs } = counted.rows[0]
      return {
        notice: `${actor.display_name} — ${state.coins.toLocaleString()} coins · ${messages} message${messages === 1 ? '' : 's'} · ${flairs} flair${flairs === 1 ? '' : 's'} · pass tier ${actor.pass_tier}`,
      }
    },
  },
  {
    name: 'rank',
    usage: '/rank [@user]',
    description: 'Where a purse sits on the coin ladder — yours unless you name someone.',
    minRank: 0,
    async run({ actor, args }) {
      const target = args.length ? await findUser(args[0]) : actor
      if (!target) return { error: 'I could not find that person. Usage: /rank [@user]' }
      if (target.ambiguous) return { error: 'More than one person has that name — use their @username.' }

      const state = (await accrueCoins(target.id)).state
      const { rows } = await q(
        `SELECT count(*) FILTER (WHERE royal_coins > $1)::int AS ahead,
                count(*)::int AS total
         FROM users WHERE banned = FALSE`,
        [state.coins],
      )
      const { ahead, total } = rows[0]
      return {
        notice: `${target.display_name} sits at #${ahead + 1} of ${total} purses with ${state.coins.toLocaleString()} royal coins.`,
      }
    },
  },
  {
    name: 'ai',
    usage: '/ai <question or command>',
    description: 'Ask the Royal Aide anything, or a command — /ai help lists them.',
    minRank: 0,
    async run({ actor, channel, args }) {
      // The Aide answers in the room itself (as Royal Aide), so this command posts nothing.
      const ask = cleanText(args.join(' '), 200).trim()
      await answerAi({ actor, channel, content: ask ? `!ai ${ask}` : '!ai help' })
      return { ok: true }
    },
  },
]

export function commandCatalog(rank) {
  return COMMANDS.filter(command => rank >= command.minRank).map(
    ({ name, usage, description, minRank }) => ({ name, usage, description, minRank }),
  )
}

export async function runCommand({ actor, channel, content }) {
  const [rawName, ...args] = content.slice(1).trim().split(/\s+/)
  const name = (rawName ?? '').toLowerCase()
  const command = COMMANDS.find(item => item.name === name)
  if (!command) return { error: `I don't know /${name}. Type /help for the list.` }
  if (rankOf(actor.role) < command.minRank) {
    // A member poking at moderator commands is worth a line in the audit trail.
    audit('command-denied', { actor: actor.username, command: name, rank: rankOf(actor.role) })
    return { error: `/${command.name} needs ${roleForRank(command.minRank)} or higher.` }
  }

  let outcome
  try {
    outcome = await command.run({ actor, channel, args })
  } catch (error) {
    console.error('command failed', name, error)
    return { error: `/${command.name} did not go through.` }
  }
  if (outcome?.error) return { error: outcome.error }
  if (outcome?.notice) await postSystem(channel, outcome.notice)
  if (outcome?.refresh === 'channel') {
    emitTo(`channel:${channel.id}`, 'messages:refresh', { channelId: channel.id })
  }
  return { ok: true }
}
