import { q } from './db.js'
import { emitTo } from './realtime.js'
import { publicMessage } from './serializers.js'
import { accrueCoins } from './coins.js'

// The Royal Aide — the chat's own bot. It answers a message that starts with "!ai"
// with a line in the room. Every answer is computed right here from the database, so it
// costs nothing to run and never needs an outside service.
//
// Adding a command is one entry in AI_COMMANDS: `run({ actor, channel, args })` returns
// the text to say (or `{ error }` to refuse). `usage` is what "!ai help" prints.

export const AI_NAME = 'Royal Aide'

const TRIGGER = /^!ai(?:\s|$)/i

export const isAiMessage = content => TRIGGER.test(content)

export const AI_COMMANDS = [
  {
    name: 'help',
    usage: '!ai help',
    description: 'List everything the Aide can do.',
    async run() {
      const lines = AI_COMMANDS.map(item => `${item.usage} — ${item.description}`)
      return `${AI_NAME} online. ${lines.join('  ·  ')}`
    },
  },
  {
    name: 'balance',
    usage: '!ai balance',
    description: 'Check your royal coins.',
    async run({ actor }) {
      const { state } = await accrueCoins(actor.id)
      return `${actor.display_name} holds ${state.coins} royal coins · ${state.perTick} more every ${state.tickMinutes} minutes.`
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

/** Read a "!ai <command> <args…>" message and answer it in the same channel. */
export async function answerAi({ actor, channel, content }) {
  const [, name = 'help', ...args] = content.trim().split(/\s+/)
  const command = AI_COMMANDS.find(item => item.name === name.toLowerCase())

  if (!command) {
    await postBotMessage(
      channel.id,
      `${AI_NAME} does not know "${name}" yet — try !ai help for the list.`,
    )
    return
  }

  let reply
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
