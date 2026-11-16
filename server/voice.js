import { q } from './db.js'
import { take } from './guard.js'
import { canEnterChannel, flairLabel } from './flairs.js'

/**
 * Voice rooms are WebRTC audio between the people in them; this module is only the
 * switchboard. It never touches the audio and never stores anything — the roster lives
 * in memory like presence, so an API restart empties every room and the browsers that
 * reconnect simply join again.
 *
 * One account sits in one room at a time: a second tab moves the seat instead of opening
 * a second microphone into the same room. Signals are relayed only between two people in
 * the same room, so the socket cannot be used as an open relay.
 */
let io = null

// channelId -> Map(userId -> participant)
const rooms = new Map()
// userId -> channelId, so a second join moves the seat rather than adding another one
const seated = new Map()

const MAX_PEERS = 8
const JOIN_LIMIT = 6
const JOIN_WINDOW = 10_000
const SIGNAL_LIMIT = 200
const SIGNAL_WINDOW = 10_000
const MAX_SIGNAL_CHARS = 24_000

/** What the other browsers may see about a participant — the socket id stays here. */
function plain(participant) {
  if (!participant) return null
  const { socketId, ...rest } = participant
  return rest
}

function roomVoice(channelId) {
  return `voice:${channelId}`
}

function roster(channelId) {
  return [...(rooms.get(channelId)?.values() ?? [])].map(plain)
}

/** Every room with at least one person in it — what the sidebar paints avatars from. */
export function voiceSnapshot() {
  const snapshot = {}
  for (const [channelId, room] of rooms) {
    if (room.size) snapshot[channelId] = [...room.values()].map(plain)
  }
  return snapshot
}

function broadcastRoster() {
  io?.emit('voice:update', voiceSnapshot())
}

function fail(socket, error) {
  socket.emit('voice:error', { error })
}

/**
 * Drop a seat without telling the browser that gave it up (it may already be gone).
 * `exceptSocketId` is the socket taking the new seat, which must not be told to leave.
 */
function release(userId, exceptSocketId = null) {
  const channelId = seated.get(userId)
  if (channelId === undefined) return
  seated.delete(userId)
  const room = rooms.get(channelId)
  const old = room?.get(userId)
  if (!room || !old) return
  room.delete(userId)
  if (!room.size) rooms.delete(channelId)

  const previous = io?.sockets?.sockets?.get(old.socketId)
  if (previous) {
    previous.leave(roomVoice(channelId))
    previous.data.voice = null
    if (previous.id !== exceptSocketId) previous.emit('voice:left', { channelId })
  }
  io?.to(roomVoice(channelId)).emit('voice:peer-leave', { userId })
}

async function joinVoice(socket, channelId) {
  const user = socket.data.user
  const { rows } = await q('SELECT * FROM channels WHERE id = $1', [channelId])
  const channel = rows[0]
  if (!channel || channel.kind !== 'voice') return fail(socket, 'That voice room is gone.')

  if (!(await canEnterChannel(user.id, channel))) {
    return fail(
      socket,
      `#${channel.name} is for ${flairLabel(channel.flair)} members — win that flair on the wheel.`,
    )
  }
  // Talking is chatting, so it follows the same gates as a channel post: the rules first,
  // and a mute keeps you out of voice until it lifts.
  if (!user.rules_accepted_at) return fail(socket, 'Accept the 10 rules before you join voice.')
  if (user.muted_until && new Date(user.muted_until) > new Date()) {
    return fail(socket, 'You are muted right now.')
  }

  if (!rooms.has(channelId)) rooms.set(channelId, new Map())
  const room = rooms.get(channelId)
  if (!room.has(user.id) && room.size >= MAX_PEERS) {
    return fail(socket, `#${channel.name} is full — ${MAX_PEERS} people is the limit.`)
  }

  release(user.id, socket.id)

  const me = {
    userId: user.id,
    socketId: socket.id,
    username: user.username,
    displayName: user.display_name || user.username,
    avatarUrl: user.avatar_url ?? null,
    color: user.color ?? '#93a5bd',
    muted: false,
    deafened: false,
  }
  room.set(user.id, me)
  seated.set(user.id, channelId)
  socket.data.voice = channelId
  socket.join(roomVoice(channelId))

  // The newcomer calls everyone already there; the room only has to answer.
  socket.emit('voice:joined', {
    channelId,
    me: plain(me),
    peers: roster(channelId).filter(person => person.userId !== user.id),
  })
  socket.to(roomVoice(channelId)).emit('voice:peer-join', plain(me))
  broadcastRoster()
}

function leaveVoice(socket, quiet = false) {
  const channelId = socket.data.voice
  if (channelId === null || channelId === undefined) return
  const room = rooms.get(channelId)
  // A moved seat belongs to the newer socket; the old one must not take it away.
  const me = room?.get(socket.data.user.id)
  const mine = me?.socketId === socket.id

  socket.data.voice = null
  socket.leave(roomVoice(channelId))

  if (mine) {
    room.delete(socket.data.user.id)
    seated.delete(socket.data.user.id)
    if (!room.size) rooms.delete(channelId)
    io?.to(roomVoice(channelId)).emit('voice:peer-leave', { userId: socket.data.user.id })
  }
  if (!quiet) socket.emit('voice:left', { channelId })
  broadcastRoster()
}

function setState(socket, payload) {
  const channelId = socket.data.voice
  if (channelId === null || channelId === undefined) return
  const me = rooms.get(channelId)?.get(socket.data.user.id)
  if (!me || me.socketId !== socket.id) return

  if (typeof payload?.muted === 'boolean') me.muted = payload.muted
  if (typeof payload?.deafened === 'boolean') me.deafened = payload.deafened

  socket.to(roomVoice(channelId)).emit('voice:peer-state', plain(me))
  broadcastRoster()
}

function relaySignal(socket, payload) {
  if (!take(`voice:signal:${socket.id}`, SIGNAL_LIMIT, SIGNAL_WINDOW).ok) return
  const channelId = socket.data.voice
  if (channelId === null || channelId === undefined) return

  const to = Number(payload?.to)
  if (!Number.isInteger(to) || to <= 0 || to === socket.data.user.id) return
  // Only the same room: the relay is not a general-purpose message bus.
  const target = rooms.get(channelId)?.get(to)
  if (!target) return

  const data = payload?.data
  if (!data || typeof data !== 'object') return
  try {
    if (JSON.stringify(data).length > MAX_SIGNAL_CHARS) return
  } catch {
    return
  }

  io?.to(target.socketId).emit('voice:signal', { from: socket.data.user.id, data })
}

export function initVoice(server) {
  io = server
}

/** Wire one socket's voice events; called for every connection in realtime.js. */
export function attachVoice(socket) {
  socket.on('voice:sync', () => socket.emit('voice:update', voiceSnapshot()))

  socket.on('voice:join', async payload => {
    // Joining is a small, rare event, but a scripted loop could still fill the roster.
    if (!take(`voice:join:${socket.id}`, JOIN_LIMIT, JOIN_WINDOW).ok) return
    const channelId = Number(payload?.channelId)
    if (!Number.isInteger(channelId) || channelId <= 0) return
    try {
      await joinVoice(socket, channelId)
    } catch {
      fail(socket, 'Voice is unavailable right now.')
    }
  })

  socket.on('voice:leave', () => leaveVoice(socket))
  socket.on('voice:state', payload => setState(socket, payload))
  socket.on('voice:signal', payload => relaySignal(socket, payload))
  socket.on('disconnect', () => leaveVoice(socket, true))
}
