import { randomInt } from 'node:crypto'
import { q } from './db.js'
import { emitTo, onlineIds, onlineWhere } from './realtime.js'
import { publicMessage } from './serializers.js'
import { accrueCoins, coinText, topWallets } from './coins.js'
import { converse, evaluateExpression } from './aide-voice.js'

// The Royal Aide — the chat's own bot. It answers a message that starts with "!ask"
// with a line in the room. Every answer is computed right here from the database, so it
// costs nothing to run and never needs an outside service.
//
// Two halves: AI_COMMANDS is the table (`!ask <name>`), and anything that names no command
// is handed to `converse` in aide-voice.js, which answers plain questions in the Aide's voice.
//
// Adding a command is one entry in AI_COMMANDS: `run({ actor, channel, args })` returns
// the text to say (or `{ error }` to refuse). `usage` is what "!ask help" prints.

export const AI_NAME = 'Royal Aide'

const TRIGGER = /^!ask(?:\s|$)/i

export const isAiMessage = content => TRIGGER.test(content)

const pick = list => list[randomInt(list.length)]
const coins = coinText

const JOKES = [
  'a packet walks into a room and drops its payload. nobody noticed — it was UDP.',
  'i told the database a secret. it indexed it.',
  'two sockets fall in love. the handshake was awkward, but the connection held.',
  'my wallet accrues 100 coins every ten minutes. the bank called; it wants to know where i get my patience.',
]

const FACTS = [
  'the word "bug" really did come from a moth found in a relay in 1947, taped into the logbook.',
  'a single 10-minute tick pays exactly 100 coins here — that is 14,400 a day if you never close the tab.',
  'the first message ever sent over the internet was "LO" — it was supposed to be "LOGIN".',
  'the owner of this room holds more coins than the total ever earned by everyone else. that is the job.',
]

const RIDDLES = [
  ['i am always running but never walk, always going but never arrive. what am i?', 'a clock.'],
  ['i hold everything you say here and never say a word back. what am i?', 'this room.'],
  ['the more of me you take, the more you leave behind. what am i?', 'steps.'],
  ['i get shorter as you climb. what am i?', 'a ladder — the coin ladder included.'],
]

const COMPLIMENTS = [
  'your timing in this room is better than the coin drip.',
  'you have the energy of a fresh socket handshake — welcome and reliable.',
  'somewhere out there a thread is better because you answered it.',
  'you pick up on things other people scroll straight past. that is worth something.',
]

const ROASTS = [
  'you type like your composer still has the one-second hold, but in your soul.',
  'your flair collection is curated. your coin purse is not.',
  'you have the confidence of an owner and the balance of a new signup.',
  'you would win the ladder if the ladder were sorted by good intentions.',
]

/** One person, by @username first and display name only when it is unambiguous. */
async function findPerson(token) {
  const name = String(token ?? '').replace(/^@/, '').trim()
  if (!name) return null
  const byUsername = await q('SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1', [name])
  if (byUsername.rows.length) return byUsername.rows[0]
  const byDisplay = await q('SELECT * FROM users WHERE lower(display_name) = lower($1) LIMIT 2', [name])
  if (byDisplay.rows.length > 1) return { ambiguous: name }
  return byDisplay.rows[0] ?? null
}

async function ladderPosition(userId) {
  const { rows } = await q(
    `SELECT count(*)::int AS ahead, (SELECT count(*)::int FROM users WHERE NOT banned) AS total
       FROM users
      WHERE NOT banned
        AND royal_coins > (SELECT royal_coins FROM users WHERE id = $1)`,
    [userId],
  )
  return rows[0] ?? { ahead: 0, total: 0 }
}

async function onlineLine() {
  const ids = onlineIds()
  if (!ids.length) return 'Nobody has a socket open right now — the room is quiet.'

  const { rows } = await q('SELECT id, display_name, username FROM users WHERE id = ANY($1)', [ids])
  const where = onlineWhere()
  const channelIds = [
    ...new Set(
      Object.values(where)
        .filter(entry => entry?.kind === 'channel')
        .map(entry => Number(entry.id)),
    ),
  ]

  const names = new Map()
  if (channelIds.length) {
    const found = await q('SELECT id, name FROM channels WHERE id = ANY($1)', [channelIds])
    found.rows.forEach(row => names.set(row.id, row.name))
  }

  const lines = rows.map(row => {
    const entry = where[String(row.id)] ?? where[row.id]
    const channel = entry?.kind === 'channel' ? names.get(Number(entry.id)) : null
    return `${row.display_name || row.username} — ${channel ? `#${channel}` : 'floating around'}`
  })

  const shown = lines.slice(0, 6).join(' · ')
  return `${rows.length} online: ${shown}${lines.length > 6 ? ` · and ${lines.length - 6} more` : ''}`
}

export const AI_COMMANDS = [
  {
    name: 'help',
    usage: '!ask help [topic]',
    description: 'List everything the Aide can do.',
    async run({ args }) {
      const topic = String(args[0] ?? '').toLowerCase()
      const list = topic
        ? AI_COMMANDS.filter(
            item =>
              item.name.includes(topic) ||
              item.usage.toLowerCase().includes(topic) ||
              item.description.toLowerCase().includes(topic),
          )
        : AI_COMMANDS
      if (!list.length) return `Nothing here matches "${topic}". Try !ask help on its own.`
      const lines = list.map(item => `${item.usage} — ${item.description}`)
      return `${AI_NAME} online. ${lines.join('  ·  ')}`
    },
  },
  {
    name: 'balance',
    usage: '!ask balance',
    description: 'Check your royal coins.',
    async run({ actor }) {
      const { state } = await accrueCoins(actor.id)
      return `${actor.display_name} holds ${coins(state.coins)} royal coins · ${coins(state.perTick)} more every ${state.tickMinutes} minutes.`
    },
  },
  {
    name: 'stats',
    usage: '!ask stats',
    description: 'Your purse, rank, messages and worn flairs.',
    async run({ actor }) {
      const { state } = await accrueCoins(actor.id)
      const [{ rows: counted }, { rows: worn }, position] = await Promise.all([
        q(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE system = FALSE)::int AS mine
             FROM messages WHERE author_id = $1`,
          [actor.id],
        ),
        q('SELECT count(*)::int AS n FROM user_flairs WHERE user_id = $1 AND equipped', [actor.id]),
        ladderPosition(actor.id),
      ])
      return `${actor.display_name}: ${coins(state.coins)} coins · #${position.ahead + 1} of ${position.total} on the ladder · ${counted[0].mine} messages sent · ${worn[0].n} flairs worn.`
    },
  },
  {
    name: 'top',
    usage: '!ask top',
    description: 'The five richest purses.',
    async run() {
      const leaders = await topWallets(5)
      if (!leaders.length) return 'No purses yet — the drip is still filling the first one.'
      return `The ladder: ${leaders
        .map(person => `${person.rank}. ${person.displayName} (${coins(person.coins)})`)
        .join(' · ')}`
    },
  },
  {
    name: 'online',
    usage: '!ask online',
    description: 'Who is connected, and which room they are in.',
    async run() {
      return onlineLine()
    },
  },
  {
    name: 'who',
    usage: '!ask who @user',
    description: 'A one-line profile for anyone here.',
    async run({ args }) {
      const person = await findPerson(args[0])
      if (!person) return { error: 'I could not find that person.' }
      if (person.ambiguous) return { error: 'More than one person has that name — use their @username.' }
      const [{ rows: counted }, position] = await Promise.all([
        q('SELECT count(*)::int AS mine FROM messages WHERE author_id = $1 AND system = FALSE', [
          person.id,
        ]),
        ladderPosition(person.id),
      ])
      const state = onlineIds().includes(person.id) ? 'online' : 'offline'
      return `${person.display_name} (@${person.username}) · ${person.role} · ${state} · ${coins(person.royal_coins)} coins, #${position.ahead + 1} on the ladder · ${counted[0].mine} messages.`
    },
  },
  {
    name: 'summarize',
    usage: '!ask summarize',
    description: 'Sum up the recent life of this channel.',
    async run({ channel }) {
      const { rows } = await q(
        `SELECT author_name, content, system
           FROM messages
          WHERE channel_id = $1
          ORDER BY id DESC
          LIMIT 40`,
        [channel.id],
      )
      if (!rows.length) return `#${channel.name} is still blank — nothing to summarise yet.`

      const speakers = new Map()
      for (const row of rows) {
        if (row.system) continue
        speakers.set(row.author_name, (speakers.get(row.author_name) ?? 0) + 1)
      }
      const busiest = [...speakers.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => `${name} (${count})`)
        .join(', ')
      const latest = rows[0].content.replace(/\s+/g, ' ').slice(0, 90)
      return `#${channel.name}: the last ${rows.length} messages${busiest ? ` · busiest: ${busiest}` : ''} · latest line: "${latest}"`
    },
  },
  {
    name: 'count',
    usage: '!ask count',
    description: 'How many messages this channel holds.',
    async run({ channel }) {
      const { rows } = await q(
        'SELECT count(*)::int AS total FROM messages WHERE channel_id = $1',
        [channel.id],
      )
      return `#${channel.name} holds ${coins(rows[0].total)} messages.`
    },
  },
  {
    name: 'joke',
    usage: '!ask joke',
    description: 'One dry joke, no charge.',
    async run() {
      return pick(JOKES)
    },
  },
  {
    name: 'fact',
    usage: '!ask fact',
    description: 'A small true thing.',
    async run() {
      return pick(FACTS)
    },
  },
  {
    name: 'riddle',
    usage: '!ask riddle',
    description: 'A riddle, with the answer.',
    async run() {
      const [question, answer] = pick(RIDDLES)
      return `${question}  ·  answer: ${answer}`
    },
  },
  {
    name: 'compliment',
    usage: '!ask compliment [@user]',
    description: 'Say something nice, to you or someone else.',
    async run({ actor, args }) {
      const person = args[0] ? await findPerson(args[0]) : actor
      if (!person) return { error: 'I could not find that person.' }
      if (person.ambiguous) return { error: 'More than one person has that name — use their @username.' }
      return `${person.display_name}: ${pick(COMPLIMENTS)}`
    },
  },
  {
    name: 'roast',
    usage: '!ask roast [@user]',
    description: 'A gentle roast — nobody bleeds.',
    async run({ actor, args }) {
      const person = args[0] ? await findPerson(args[0]) : actor
      if (!person) return { error: 'I could not find that person.' }
      if (person.ambiguous) return { error: 'More than one person has that name — use their @username.' }
      return `${person.display_name}: ${pick(ROASTS)}`
    },
  },
  {
    name: 'coin',
    usage: '!ask coin',
    description: 'Call it — heads or tails.',
    async run({ actor }) {
      return `${actor.display_name} flips a coin — ${randomInt(2) === 0 ? 'heads' : 'tails'}.`
    },
  },
  {
    name: 'dice',
    usage: '!ask dice [sides]',
    description: 'Roll one die, d6 by default (2-1000).',
    async run({ actor, args }) {
      const sides = Math.min(1000, Math.max(2, Number(args[0]) || 6))
      return `${actor.display_name} rolls a d${sides} — ${randomInt(1, sides + 1)}.`
    },
  },
  {
    name: 'choose',
    usage: '!ask choose a | b | c',
    description: 'Hand the decision to the Aide.',
    async run({ args }) {
      const options = args
        .join(' ')
        .split(/[|,]|\bor\b/i)
        .map(option => option.trim())
        .filter(Boolean)
      if (options.length < 2) return { error: 'Give me at least two options, separated by | or a comma.' }
      return `I'd go with ${pick(options)}.`
    },
  },
  {
    name: 'math',
    usage: '!ask math 12 * (3 + 1)',
    description: 'Arithmetic, worked out server-side.',
    async run({ args }) {
      const expression = args.join(' ')
      const value = evaluateExpression(expression)
      if (value === null) return { error: 'That is not arithmetic I can read — numbers and + - * / % ^ ( ) only.' }
      return `${expression} = ${coins(value)}`
    },
  },
  {
    name: 'time',
    usage: '!ask time',
    description: 'The server clock, so nobody argues.',
    async run() {
      const now = new Date()
      return `Server time: ${now.toISOString().slice(0, 19).replace('T', ' ')} UTC.`
    },
  },
]

/** A bot line in the room. System messages cannot be edited or deleted, same as /commands. */
async function postBotMessage(channelId, content) {
  const { rows } = await q(
    `INSERT INTO messages (channel_id, author_name, author_role, content, system)
     VALUES ($1, $2, 'system', $3, TRUE) RETURNING *`,
    [channelId, AI_NAME, content],
  )
  emitTo(`channel:${channelId}`, 'message:new', publicMessage(rows[0]))
}

/** Read a "!ask <command> <args…>" message and answer it in the same channel. */
export async function answerAi({ actor, channel, content }) {
  const body = content.replace(TRIGGER, '').trim()
  const [name = '', ...args] = body.split(/\s+/)
  const command = AI_COMMANDS.find(item => item.name === name.toLowerCase())

  let reply
  if (!command) {
    // Not a command word — hold the conversation instead of refusing.
    try {
      reply = await converse({ actor, channel, text: body })
    } catch (error) {
      console.error('aide conversation failed', error)
      reply = `${AI_NAME} could not find an answer to that.`
    }
    await postBotMessage(channel.id, reply)
    return
  }

  try {
    reply = await command.run({ actor, channel, args })
  } catch (error) {
    console.error('ai command failed', command.name, error)
    reply = `${AI_NAME} could not do that right now.`
  }
  if (reply?.error) {
    await postBotMessage(channel.id, `${AI_NAME}: ${reply.error}`)
    return
  }
  await postBotMessage(channel.id, typeof reply === 'string' ? reply : 'Done.')
}
