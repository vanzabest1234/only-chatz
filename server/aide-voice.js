import { randomInt } from 'node:crypto'
import { q } from './db.js'
import { accrueCoins, topWallets } from './coins.js'
import { onlineIds, onlineWhere } from './realtime.js'

// The Royal Aide's conversational side. Free text arrives here when it names no command,
// and every answer is worked out from this room's own database and the API process's live
// presence map — no model, no API key, no outside service.

const pick = list => list[randomInt(list.length)]
const coins = value => Number(value ?? 0).toLocaleString('en-US')

/**
 * A tiny arithmetic parser for "!ask math" and "what is 12 * 3".
 * Numbers and + - * / % ^ ( ) only; anything else returns null instead of being evaluated.
 */
export function evaluateExpression(expression) {
  const text = String(expression ?? '')
    .replace(/\s+/g, '')
    .replace(/[×x]/gi, '*')
    .replace(/÷/g, '/')
  if (!text || !/^[-+*/%^().\d]+$/.test(text)) return null

  let at = 0
  const peek = () => text[at]

  const number = () => {
    const start = at
    while (at < text.length && /[\d.]/.test(text[at])) at += 1
    if (start === at) throw new Error('number')
    const value = Number(text.slice(start, at))
    if (!Number.isFinite(value)) throw new Error('number')
    return value
  }

  const factor = () => {
    if (peek() === '-') {
      at += 1
      return -factor()
    }
    if (peek() === '+') {
      at += 1
      return factor()
    }
    if (peek() === '(') {
      at += 1
      const value = sum()
      if (peek() !== ')') throw new Error('paren')
      at += 1
      return value
    }
    return number()
  }

  const power = () => {
    const base = factor()
    if (peek() === '^') {
      at += 1
      return base ** power()
    }
    return base
  }

  const term = () => {
    let value = power()
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = peek()
      at += 1
      const rhs = power()
      value = op === '*' ? value * rhs : op === '/' ? value / rhs : value % rhs
    }
    return value
  }

  function sum() {
    let value = term()
    while (peek() === '+' || peek() === '-') {
      const op = peek()
      at += 1
      const rhs = term()
      value = op === '+' ? value + rhs : value - rhs
    }
    return value
  }

  try {
    const value = sum()
    if (at !== text.length || !Number.isFinite(value)) return null
    return value
  } catch {
    return null
  }
}

/** "what is 12 * 3" → 36 — a question wrapping arithmetic still gets an answer. */
function mathFromText(text) {
  const stripped = text.replace(/^(what('| i)?s|what is|how much is|calculate|compute|solve)\s*/i, '')
  const hasOperator = /[-+*/%^×÷]/.test(stripped) && /\d/.test(stripped)
  return hasOperator ? evaluateExpression(stripped) : null
}

async function presence() {
  const ids = onlineIds()
  if (!ids.length) return { names: [] }
  const { rows } = await q('SELECT id, display_name, username FROM users WHERE id = ANY($1)', [ids])
  return { names: rows.map(row => row.display_name || row.username) }
}

async function topThree() {
  const leaders = await topWallets(3)
  return leaders
    .map(person => `${person.rank}. ${person.displayName} — ${coins(person.coins)}`)
    .join(' · ')
}

const GREETINGS = ['hey', 'morning', 'good to see you', 'hello']

const SMALL_TALK = [
  {
    match: /\bhow('| a)?re (you|u)\b|how are things/i,
    async reply({ actor }) {
      const { state } = await accrueCoins(actor.id)
      return `Running clean, thanks for asking — no memory leaks, no feelings to lose. You're holding ${coins(state.coins)} royal coins; ${coins(state.perTick)} more land every ${state.tickMinutes} minutes.`
    },
  },
  {
    match: /\b(thanks|thank you|ty|cheers)\b/i,
    async reply() {
      return pick([
        "Any time — that's the whole job.",
        'Glad that helped. Anything else on your mind?',
      ])
    },
  },
  {
    match: /\b(who are you|what are you|your name|are you (a )?(bot|real|human|ai))\b/i,
    async reply() {
      return "The Royal Aide — this room's own bot. I'm not a model and I call no outside service: every line I say comes from this server's database and its command table. Type !ask help and you'll see the whole repertoire."
    },
  },
  {
    match: /\b(what can you do|how do you work|capabilities|your commands?)\b/i,
    async reply() {
      return "I can read this room: purses, the coin ladder, who is online and where, how busy a channel is, plus a bit of fun — jokes, riddles, dice, maths, gentle roasts. !ask help prints every command; ask me something in plain words and I'll try to answer."
    },
  },
  {
    match: /\b(who('| i)?s online|anybody (here|on)|anyone (here|on)|who is here)\b/i,
    async reply() {
      const { names } = await presence()
      if (!names.length) return 'Nobody but you has a socket open right now. The room fills up fast enough.'
      const list = names.slice(0, 8).join(', ')
      const more = names.length > 8 ? ` and ${names.length - 8} more` : ''
      return `${names.length} here right now: ${list}${more}.`
    },
  },
  {
    match: /\b(who('| i)?s (winning|richest)|leaderboard|top purses?|richest)\b/i,
    async reply() {
      return `The ladder's top three: ${await topThree()}. !ask top shows five, and /leaderboard posts all ten in chat.`
    },
  },
  {
    match: /\b(coins?|wallet|balance|purse|how much (do i|have i) got)\b/i,
    async reply({ actor }) {
      const { state } = await accrueCoins(actor.id)
      return `${actor.display_name}, you hold ${coins(state.coins)} royal coins. The clock pays ${coins(state.perTick)} every ${state.tickMinutes} minutes while your purse is open, and a wheel spin costs ${coins(state.spinCost)}.`
    },
  },
  {
    match: /\b(wheel|flair)/i,
    async reply() {
      return 'The wheel costs 1,000 coins a turn (a banked pass token is spent first) and only three flairs can be worn at once. The 0.01% slice hands out a custom tag you write yourself in settings.'
    },
  },
  {
    match: /\b(pass|season|xp)\b/i,
    async reply() {
      return 'The season pass earns 2 XP for every minute your tab stays open. Tiers hand out frames and extra wheel spins, and a finished track resets with the new season.'
    },
  },
  {
    match: /\b(rules?|terms|house)\b/i,
    async reply() {
      return 'The ten house rules sit behind the gate the first time you speak — the banner above the composer reopens it. Nothing is permanent until you press accept, and reading is always open.'
    },
  },
  {
    match: /\b(i'?m|i am|im|i feel)\s+(sad|tired|bored|lonely|down|stressed|anxious)\b/i,
    async reply({ channel }) {
      return pick([
        `That's noted, and I mean it — this room is better with you in it. If you want company, #${channel.name} is where everyone gathers; if you want a distraction, !ask joke or !ask dice will do.`,
        "Sounds like a lot to carry. I can't fix the day, but I can sit here with you, roll some dice, or read you the room's numbers. Your call.",
      ])
    },
  },
  {
    match: /\b(i'?m|i am|im|i feel)\s+(happy|excited|great|good|amazing)\b/i,
    async reply() {
      return pick([
        'Good to hear it. Whatever is going right, keep it — the room could use the energy.',
        "That's the spirit. Tell me what happened and I'll pretend to be impressed. Actually, I will be.",
      ])
    },
  },
  {
    match: /^\s*(hi|hey|hello|yo|sup|hiya|howdy|good (morning|afternoon|evening))\b/i,
    async reply({ actor }) {
      const { names } = await presence()
      const company = names.length
        ? `${names.length} of us are floating right now.`
        : 'You have the place to yourself for the moment.'
      return `${pick(GREETINGS)} ${actor.display_name}. ${company} Need anything — numbers, a joke, a dice roll?`
    },
  },
]

const FALLBACKS = [
  text =>
    `I'll be honest: "${text.slice(0, 80)}" isn't something I can look up. I'm a command table with good manners, not a model. What I can do is read this room — try !ask stats, !ask online or !ask top.`,
  () =>
    'Good question, and I would rather not guess. Ask me about purses, the ladder, who is online, or how busy this channel is — those I can answer straight from the database.',
  () =>
    'That one is past my line. Type !ask help for the whole list; if it is about this room, there is a good chance I can read it out.',
]

/** Answer free text in the Aide's own voice. Returns one line to post in the room. */
export async function converse({ actor, channel, text }) {
  const said = String(text ?? '').trim()
  if (!said) {
    return 'Ask me anything about this room — !ask help lists the commands, or just type a question.'
  }

  const math = mathFromText(said)
  if (math !== null) {
    return `${said.replace(/\?$/, '')} = ${coins(math)}`
  }

  for (const item of SMALL_TALK) {
    if (!item.match.test(said)) continue
    try {
      return await item.reply({ actor, channel })
    } catch (error) {
      console.error('aide small talk failed', error)
      return 'My notes went missing for a second there — try that again?'
    }
  }

  return pick(FALLBACKS)(said)
}
