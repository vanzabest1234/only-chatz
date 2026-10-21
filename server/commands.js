import { q } from './db.js'
import { destroyUserSessions } from './auth.js'
import { emitAll, emitTo } from './realtime.js'
import { ASSIGNABLE_ROLES, rankOf, labelFor, roleForRank } from './roles.js'
import { publicMessage } from './serializers.js'

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

async function findUser(token) {
  if (!token) return null
  const name = String(token).replace(/^@/, '')
  if (!name) return null
  const { rows } = await q(
    'SELECT * FROM users WHERE lower(username) = lower($1) OR lower(display_name) = lower($1) LIMIT 1',
    [name],
  )
  return rows[0] ?? null
}

function guardTarget(actor, target) {
  if (!target) return 'I could not find that person.'
  if (target.id === actor.id) return 'You cannot use that on yourself.'
  if (rankOf(target.role) >= rankOf(actor.role)) {
    return 'You cannot act on someone at or above your own rank.'
  }
  return null
}

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
      const name = args.join(' ').trim()
      if (!name || name.length > 32) return { error: 'Usage: /nick <new display name>' }
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
      const topic = args.join(' ').trim().slice(0, 140)
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
      const reason = args.slice(2).join(' ').trim()
      await q(`UPDATE users SET muted_until = now() + ($1 || ' minutes')::interval WHERE id = $2`, [
        String(Math.round(minutes)),
        target.id,
      ])
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
      const reason = args.slice(1).join(' ').trim()
      await destroyUserSessions(target.id)
      emitTo(`user:${target.id}`, 'session:revoke', {
        message: `You were kicked by ${actor.display_name}.${reason ? ` Reason: ${reason}` : ''}`,
      })
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
      const reason = args.slice(1).join(' ').trim()
      await q('UPDATE users SET banned = TRUE WHERE id = $1', [target.id])
      await destroyUserSessions(target.id)
      emitTo(`user:${target.id}`, 'session:revoke', {
        message: `You were banned by ${actor.display_name}.${reason ? ` Reason: ${reason}` : ''}`,
      })
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
      if (!target.banned) return { error: `${target.display_name} is not banned.` }
      if (rankOf(target.role) >= rankOf(actor.role)) {
        return { error: 'You cannot act on someone at or above your own rank.' }
      }
      await q('UPDATE users SET banned = FALSE WHERE id = $1', [target.id])
      emitAll('members:refresh')
      return { notice: `${target.display_name} was unbanned by ${actor.display_name}.` }
    },
  },
  {
    name: 'role',
    usage: '/role @user <role>',
    description: 'Give someone a role below your own.',
    minRank: 2,
    async run({ actor, args }) {
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
      emitAll('members:refresh')
      emitTo(`user:${target.id}`, 'profile:update')
      return { notice: `${target.display_name} is now ${labelFor(role)}.` }
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
