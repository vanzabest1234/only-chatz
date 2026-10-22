import { Server } from 'socket.io'
import { q } from './db.js'
import { sessionUser } from './auth.js'
import { audit, take } from './guard.js'

let io = null
const online = new Map()
// Which room each person is looking at — in memory, rebuilt as clients report in.
const where = new Map()
// Open sockets per account, so one client cannot open connections without bound.
const socketCount = new Map()

const MAX_SOCKETS_PER_USER = 5
const PRESENCE_LIMIT = 10
const PRESENCE_WINDOW = 10_000

function whereSnapshot() {
  return Object.fromEntries(where)
}

export function initRealtime(httpServer) {
  io = new Server(httpServer)

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

    socket.on('disconnect', () => {
      const open = (socketCount.get(user.id) ?? 1) - 1
      if (open > 0) socketCount.set(user.id, open)
      else socketCount.delete(user.id)

      const remaining = (online.get(user.id) ?? 1) - 1
      if (remaining <= 0) {
        online.delete(user.id)
        where.delete(user.id)
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
