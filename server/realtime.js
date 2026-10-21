import { Server } from 'socket.io'
import { q } from './db.js'
import { sessionUser } from './auth.js'

let io = null
const online = new Map()
// Which room each person is looking at — in memory, rebuilt as clients report in.
const where = new Map()

function whereSnapshot() {
  return Object.fromEntries(where)
}

export function initRealtime(httpServer) {
  io = new Server(httpServer)

  io.use(async (socket, next) => {
    const user = await sessionUser(socket.handshake.auth?.token)
    if (!user) return next(new Error('unauthorized'))
    socket.data.user = user
    next()
  })

  io.on('connection', async socket => {
    const user = socket.data.user
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

    socket.on('presence:where', payload => {
      const kind = payload?.kind === 'dm' ? 'dm' : 'channel'
      const id = Number(payload?.id)
      if (!Number.isFinite(id)) return
      where.set(user.id, { kind, id })
      io.emit('presence:where', whereSnapshot())
    })

    socket.on('disconnect', () => {
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

export function onlineIds() {
  return [...online.keys()]
}

export function onlineWhere() {
  return whereSnapshot()
}
