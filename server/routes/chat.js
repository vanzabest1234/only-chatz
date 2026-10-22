import { Router } from 'express'
import { q } from '../db.js'
import { requireAuth } from '../auth.js'
import { emitTo, joinThread, onlineIds, onlineWhere } from '../realtime.js'
import { publicMessage, publicUser } from '../serializers.js'
import { rankOf } from '../roles.js'
import { audit, cleanText, recentAudit, take } from '../guard.js'
import { commandCatalog, runCommand } from '../commands.js'

const router = Router()

const MAX_MESSAGE = 2000
const MAX_COMMAND = 400

// Only identifiers this module chooses may be interpolated into SQL.
const MESSAGE_COLUMNS = new Set(['channel_id', 'thread_id'])

function readId(raw) {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Text a person typed, minus control/invisible characters, within the length cap. */
function readContent(raw) {
  if (typeof raw !== 'string') return { error: 'Messages have to be text.' }
  const content = cleanText(raw, MAX_MESSAGE + 1).trim()
  if (!content) return { error: 'Type a message first.' }
  if (content.length > MAX_MESSAGE) return { error: 'Messages top out at 2000 characters.' }
  return { content }
}

/** Burst + sustained allowance per account; a scripted flood trips the first one. */
function overPostingLimit(user, res) {
  const burst = take(`msg:burst:${user.id}`, 8, 5_000)
  const steady = take(`msg:steady:${user.id}`, 40, 60_000)
  if (burst.ok && steady.ok) return false

  const retry = Math.max(burst.retryAfter, steady.retryAfter, 1)
  if (take(`audit:msg:${user.id}`, 1, 60_000).ok) {
    audit('message-flood', { userId: user.id, username: user.username })
  }
  res.set('Retry-After', String(retry))
  res.status(429).json({ error: `You are posting too fast — wait ${retry}s.` })
  return true
}

async function loadSnapshot(user) {
  const [channels, members, friends, threads] = await Promise.all([
    q('SELECT id, name, topic, slowmode, position, announce FROM channels ORDER BY position, id'),
    q('SELECT * FROM users WHERE banned = FALSE ORDER BY id'),
    q('SELECT friend_id FROM friendships WHERE user_id = $1', [user.id]),
    q(
      `SELECT t.id AS thread_id,
              peer.id AS peer_id, peer.display_name AS peer_name,
              peer.role AS peer_role, peer.color AS peer_color,
              peer.avatar_url AS peer_avatar,
              lm.id AS last_id, lm.content AS last_content,
              lm.created_at AS last_at, lm.author_id AS last_author
         FROM dm_threads t
         JOIN dm_members me ON me.thread_id = t.id AND me.user_id = $1
         JOIN LATERAL (
           SELECT u.* FROM dm_members m2
             JOIN users u ON u.id = m2.user_id
            WHERE m2.thread_id = t.id AND u.id <> $1
            LIMIT 1
         ) peer ON TRUE
         LEFT JOIN LATERAL (
           SELECT m.id, m.content, m.created_at, m.author_id
             FROM messages m
            WHERE m.thread_id = t.id
            ORDER BY m.id DESC
            LIMIT 1
         ) lm ON TRUE
        ORDER BY COALESCE(lm.id, 0) DESC`,
      [user.id],
    ),
  ])

  return {
    user: publicUser(user),
    channels: channels.rows,
    members: members.rows.map(publicUser),
    friends: friends.rows.map(row => row.friend_id),
    threads: threads.rows.map(row => ({
      id: row.thread_id,
      peer: {
        id: row.peer_id,
        displayName: row.peer_name,
        role: row.peer_role,
        color: row.peer_color,
        avatarUrl: row.peer_avatar ?? null,
      },
      lastMessage: row.last_id
        ? {
            id: Number(row.last_id),
            content: row.last_content,
            createdAt: row.last_at,
            authorId: row.last_author,
          }
        : null,
    })),
    online: onlineIds(),
    where: onlineWhere(),
    commands: commandCatalog(rankOf(user.role)),
  }
}

async function hydrateMessage(id) {
  const { rows } = await q(
    `SELECT m.*, u.display_name, u.role, u.color, u.avatar_url
       FROM messages m LEFT JOIN users u ON u.id = m.author_id
      WHERE m.id = $1`,
    [id],
  )
  return publicMessage(rows[0])
}

async function listMessages(column, id) {
  if (!MESSAGE_COLUMNS.has(column)) throw new Error(`unknown message column: ${column}`)
  const { rows } = await q(
    `SELECT m.*, u.display_name, u.role, u.color, u.avatar_url
       FROM messages m LEFT JOIN users u ON u.id = m.author_id
      WHERE m.${column} = $1
      ORDER BY m.id DESC
      LIMIT 80`,
    [id],
  )
  return rows.reverse().map(publicMessage)
}

async function checkCanSpeak(user, channel) {
  if (channel?.announce && user.role !== 'owner') {
    return { status: 403, error: `Only the Owner can post in #${channel.name}.` }
  }
  if (user.muted_until && new Date(user.muted_until) > new Date()) {
    return { status: 403, error: 'You are muted right now.' }
  }
  if (channel?.slowmode > 0) {
    const { rows } = await q(
      'SELECT created_at FROM messages WHERE channel_id = $1 AND author_id = $2 ORDER BY id DESC LIMIT 1',
      [channel.id, user.id],
    )
    if (rows[0]) {
      const wait = channel.slowmode * 1000 - (Date.now() - new Date(rows[0].created_at).getTime())
      if (wait > 0) {
        return { status: 429, error: `Slowmode is on — try again in ${Math.ceil(wait / 1000)}s.` }
      }
    }
  }
  return null
}

router.get('/me', requireAuth, async (req, res) => {
  res.json(await loadSnapshot(req.user))
})

// Owner-visible trail of refused logins, floods and privileged actions.
router.get('/audit', requireAuth, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only.' })
  res.json({ entries: recentAudit() })
})

router.get('/channels/:id/messages', requireAuth, async (req, res) => {
  const channelId = readId(req.params.id)
  if (!channelId) return res.status(400).json({ error: 'That channel no longer exists.' })

  const channel = await q('SELECT 1 FROM channels WHERE id = $1', [channelId])
  if (!channel.rows.length) return res.status(404).json({ error: 'That channel no longer exists.' })

  res.json({ messages: await listMessages('channel_id', channelId) })
})

router.post('/channels/:id/messages', requireAuth, async (req, res) => {
  const channelId = readId(req.params.id)
  if (!channelId) return res.status(400).json({ error: 'That channel no longer exists.' })

  const read = readContent(req.body?.content)
  if (read.error) return res.status(400).json({ error: read.error })
  const content = read.content

  const { rows } = await q('SELECT * FROM channels WHERE id = $1', [channelId])
  const channel = rows[0]
  if (!channel) return res.status(404).json({ error: 'That channel no longer exists.' })

  if (overPostingLimit(req.user, res)) return

  const blocked = await checkCanSpeak(req.user, channel)
  if (blocked) return res.status(blocked.status).json({ error: blocked.error })

  if (content.startsWith('/')) {
    if (content.length > MAX_COMMAND) {
      return res.status(400).json({ error: 'That command is too long.' })
    }
    const outcome = await runCommand({ actor: req.user, channel, content })
    if (outcome.error) return res.status(400).json({ error: outcome.error })
    return res.json({ ok: true })
  }

  const { rows: inserted } = await q(
    `INSERT INTO messages (channel_id, author_id, author_name, author_role, content)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [channelId, req.user.id, req.user.display_name, req.user.role, content],
  )
  const message = await hydrateMessage(inserted[0].id)
  emitTo(`channel:${channelId}`, 'message:new', message)
  res.json({ message })
})

router.post('/dm/:userId/open', requireAuth, async (req, res) => {
  const peerId = readId(req.params.userId)
  if (!peerId) return res.status(400).json({ error: 'That person is no longer here.' })
  if (peerId === req.user.id) return res.status(400).json({ error: 'You cannot direct message yourself.' })

  const peer = await q('SELECT id FROM users WHERE id = $1 AND banned = FALSE', [peerId])
  if (!peer.rows.length) return res.status(404).json({ error: 'That person is no longer here.' })

  const existing = await q(
    `SELECT t.id FROM dm_threads t
       JOIN dm_members a ON a.thread_id = t.id AND a.user_id = $1
       JOIN dm_members b ON b.thread_id = t.id AND b.user_id = $2
      LIMIT 1`,
    [req.user.id, peerId],
  )

  if (existing.rows.length) return res.json({ threadId: existing.rows[0].id })

  const created = await q('INSERT INTO dm_threads DEFAULT VALUES RETURNING id')
  const threadId = created.rows[0].id
  await q('INSERT INTO dm_members (thread_id, user_id) VALUES ($1, $2), ($1, $3)', [
    threadId,
    req.user.id,
    peerId,
  ])
  joinThread(req.user.id, threadId)
  joinThread(peerId, threadId)
  emitTo(`user:${peerId}`, 'threads:refresh')
  res.json({ threadId })
})

router.get('/dm/:threadId/messages', requireAuth, async (req, res) => {
  const threadId = readId(req.params.threadId)
  if (!threadId) return res.status(403).json({ error: 'That conversation is not yours.' })

  const member = await q('SELECT 1 FROM dm_members WHERE thread_id = $1 AND user_id = $2', [
    threadId,
    req.user.id,
  ])
  if (!member.rows.length) return res.status(403).json({ error: 'That conversation is not yours.' })
  res.json({ messages: await listMessages('thread_id', threadId) })
})

router.post('/dm/:threadId/messages', requireAuth, async (req, res) => {
  const threadId = readId(req.params.threadId)
  if (!threadId) return res.status(403).json({ error: 'That conversation is not yours.' })

  const member = await q('SELECT 1 FROM dm_members WHERE thread_id = $1 AND user_id = $2', [
    threadId,
    req.user.id,
  ])
  if (!member.rows.length) return res.status(403).json({ error: 'That conversation is not yours.' })

  const read = readContent(req.body?.content)
  if (read.error) return res.status(400).json({ error: read.error })
  const content = read.content

  if (overPostingLimit(req.user, res)) return

  const blocked = await checkCanSpeak(req.user, null)
  if (blocked) return res.status(blocked.status).json({ error: blocked.error })

  const { rows: inserted } = await q(
    `INSERT INTO messages (thread_id, author_id, author_name, author_role, content)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [threadId, req.user.id, req.user.display_name, req.user.role, content],
  )
  const message = await hydrateMessage(inserted[0].id)
  emitTo(`thread:${threadId}`, 'message:new', message)
  res.json({ message })
})

router.post('/friends/:userId', requireAuth, async (req, res) => {
  const friendId = readId(req.params.userId)
  if (!friendId) return res.status(400).json({ error: 'That person is no longer here.' })
  if (friendId === req.user.id) return res.status(400).json({ error: 'You cannot add yourself.' })

  const friend = await q('SELECT 1 FROM users WHERE id = $1', [friendId])
  if (!friend.rows.length) return res.status(404).json({ error: 'That person is no longer here.' })

  const existing = await q('SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2', [
    req.user.id,
    friendId,
  ])
  if (existing.rows.length) {
    await q('DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2', [req.user.id, friendId])
  } else {
    await q('INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2)', [req.user.id, friendId])
  }

  const { rows } = await q('SELECT friend_id FROM friendships WHERE user_id = $1', [req.user.id])
  const friends = rows.map(row => row.friend_id)
  emitTo(`user:${req.user.id}`, 'friends:update', friends)
  res.json({ friends })
})

export default router
