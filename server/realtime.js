import { Server } from 'socket.io'
import { q } from './db.js'
import { sessionUser } from './auth.js'
import { audit, take } from './guard.js'
import { addPresenceMinutes } from './pass.js'
import { accrueCoins } from './coins.js'

let io = null
const online = new Map()
// Which room each person is looking at — in memory, rebuilt as clients report in.
const where = new Map()
// Open sockets per account, so one client cannot open connections without bound.
const socketCount = new Map()

const MAX_SOCKETS_PER_USER = 5
const PRESENCE_LIMIT = 10
const PRESENCE_WINDOW = 10_000

// Who is typing where. In memory only, like presence: an entry lives for a few seconds
// after the last keystroke and is dropped by the sweep, so nobody stays "typing" forever.
const typing = new Map()
const TYPING_LIMIT = 30
const TYPING_WINDOW = 10_000
const TYPING_TTL = 4_000

function whereSnapshot() {
  return Object.fromEntries(where)
}

function typingRoom(kind, id) {
  return kind === 'dm' ? `thread:${id}` : `channel:${id}`
}

function typingNames(key) {
  const people = typing.get(key)
  return people ? [...people.values()].map(person => person.name) : []
}

/** Tell a room who is typing right now; `exclude` skips the socket that just typed. */
function broadcastTyping(key, exclude) {
  const split = key.indexOf(':')
  const kind = key.slice(0, split)
  const id = Number(key.slice(split + 1))
  const payload = { kind, id, names: typingNames(key) }
  if (exclude) exclude.to(typingRoom(kind, id)).emit('typing:update', payload)
  else io?.to(typingRoom(kind, id)).emit('typing:update', payload)
}

function forgetTypist(userId) {
  for (const [key, people] of typing) {
    if (!people.delete(userId)) continue
    if (!people.size) typing.delete(key)
    broadcastTyping(key)
  }
}

function startTypingSweep() {
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, people] of typing) {
      let changed = false
      for (const [userId, person] of people) {
        if (person.expiresAt <= now) {
          people.delete(userId)
          changed = true
        }
      }
      if (!people.size) typing.delete(key)
      if (changed) broadcastTyping(key)
    }
  }, 1_000)
  timer.unref?.()
  return timer
}

/**
 * The season pass counts minutes with a socket open. A minute is a tick, and the tick is
 * the only writer, so closing the tab stops the clock and the pass cannot be farmed offline.
 */
function startPassClock() {
  const timer = setInterval(() => {
    for (const userId of [...online.keys()]) {
      addPresenceMinutes(userId, 1)
        .then(state => {
          if (state) emitTo(`user:${userId}`, 'pass:update', state)
        })
        .catch(() => {})
    }
  }, 60_000)
  timer.unref?.()
  return timer
}

/**
 * Royal Coins drip while a socket is open: every ten seconds the online accounts are
 * asked for anything the clock owes them, and only an actual payout is broadcast, so a
 * quiet balance never causes a repaint.
 */
function startCoinClock() {
  const timer = setInterval(() => {
    for (const userId of [...online.keys()]) {
      accrueCoins(userId)
        .then(({ state, awarded }) => {
          if (awarded) emitTo(`user:${userId}`, 'coins:update', state)
        })
        .catch(() => {})
    }
  }, 10_000)
  timer.unref?.()
  return timer
}

export function initRealtime(httpServer) {
  io = new Server(httpServer)
  startTypingSweep()
  startPassClock()
  startCoinClock()

  io.use(async (socket, next) => {
    const forwarded = String(socket.handshake.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim()
    const ip = forwarded || socket.handshake.address || 'unknown'
    if (!take(`socket:${ip}`, 40, 60_000).ok) {
      audit('socket-flood', { ip })
      return next(new Error('too-many-connections'))
    }

    const user = await sessionUser(socket.handshake.auth?.token)
    if (!user || user.banned) return next(new Error('unauthorized'))

    const open = socketCount.get(user.id) ?? 0
    if (open >= MAX_SOCKETS_PER_USER) return next(new Error('too-many-connections'))

    socket.data.user = user
    socket.data.ip = ip
    next()
  })

  io.on('connection', async socket => {
    const user = socket.data.user
    socketCount.set(user.id, (socketCount.get(user.id) ?? 0) + 1)
    socket.join(`user:${user.id}`)

    const [threads, channels] = await Promise.all([
      q('SELECT thread_id FROM dm_members WHERE user_id = $1', [user.id]),
      q('SELECT id FROM channels'),
    ])
    threads.rows.forEach(row => socket.join(`thread:${row.thread_id}`))
    channels.rows.forEach(row => socket.join(`channel:${row.id}`))

    online.set(user.id, (online.get(user.id) ?? 0) + 1)
    io.emit('presence:update', onlineIds())
    io.emit('presence:where', whereSnapshot())

    socket.on('presence:where', async payload => {
      // Presence is broadcast to everyone, so it is the cheapest way to spam every
      // client. Each socket gets a small allowance and anything beyond it is dropped.
      if (!take(`presence:${socket.id}`, PRESENCE_LIMIT, PRESENCE_WINDOW).ok) return

      const kind = payload?.kind === 'dm' ? 'dm' : 'channel'
      const id = Number(payload?.id)
      if (!Number.isInteger(id) || id <= 0) return

      try {
        // Only report a room the person is actually a part of.
        const { rows } =
          kind === 'dm'
            ? await q('SELECT 1 FROM dm_members WHERE thread_id = $1 AND user_id = $2 LIMIT 1', [
                id,
                user.id,
              ])
            : await q('SELECT 1 FROM channels WHERE id = $1 LIMIT 1', [id])
        if (!rows.length) return
      } catch {
        return
      }

      where.set(user.id, { kind, id })
      io.emit('presence:where', whereSnapshot())
    })

    socket.on('typing', async payload => {
      // Typing pings are cheap and frequent, so each socket gets a small allowance.
      if (!take(`typing:${socket.id}`, TYPING_LIMIT, TYPING_WINDOW).ok) return

      const kind = payload?.kind === 'dm' ? 'dm' : 'channel'
      const id = Number(payload?.id)
      if (!Number.isInteger(id) || id <= 0) return

      try {
        // Only relay a room the person actually belongs to.
        const { rows } =
          kind === 'dm'
            ? await q('SELECT 1 FROM dm_members WHERE thread_id = $1 AND user_id = $2 LIMIT 1', [
                id,
                user.id,
              ])
            : await q('SELECT 1 FROM channels WHERE id = $1 LIMIT 1', [id])
        if (!rows.length) return
      } catch {
        return
      }

      const key = `${kind}:${id}`
      let people = typing.get(key)
      if (!people) {
        people = new Map()
        typing.set(key, people)
      }
      people.set(user.id, {
        name: user.display_name || user.username,
        expiresAt: Date.now() + TYPING_TTL,
      })
      broadcastTyping(key, socket)
    })

    socket.on('disconnect', () => {
      const open = (socketCount.get(user.id) ?? 1) - 1
      if (open > 0) socketCount.set(user.id, open)
      else socketCount.delete(user.id)

      const remaining = (online.get(user.id) ?? 1) - 1
      if (remaining <= 0) {
        online.delete(user.id)
        where.delete(user.id)
        forgetTypist(user.id)
      } else {
        online.set(user.id, remaining)
      }
      io.emit('presence:update', onlineIds())
      io.emit('presence:where', whereSnapshot())
    })
  })

  return io
}

export function emitTo(room, event, payload) {
  io?.to(room).emit(event, payload)
}

export function emitAll(event, payload) {
  io?.emit(event, payload)
}

export function joinThread(userId, threadId) {
  io?.in(`user:${userId}`).socketsJoin(`thread:${threadId}`)
}

/** Drop every socket an account has open (used by kick and ban). */
export function disconnectUser(userId) {
  io?.in(`user:${userId}`).disconnectSockets(true)
}

export function onlineIds() {
  return [...online.keys()]
}

export function onlineWhere() {
  return whereSnapshot()
}
