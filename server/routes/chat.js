import { Router } from 'express'
import { q } from '../db.js'
import { requireAuth } from '../auth.js'
import { emitTo, joinThread, onlineIds } from '../realtime.js'
import { publicMessage, publicUser } from '../serializers.js'
import { rankOf } from '../roles.js'
import { commandCatalog, runCommand } from '../commands.js'

const router = Router()

async function loadSnapshot(user) {
  const [channels, members, friends, threads] = await Promise.all([
    q('SELECT id, name, topic, slowmode, position FROM channels ORDER BY position, id'),
    q('SELECT * FROM users WHERE banned = FALSE ORDER BY id'),
    q('SELECT friend_id FROM friendships WHERE user_id = $1', [user.id]),
    q(
      `SELECT t.id AS thread_id,
              peer.id AS peer_id, peer.display_name AS peer_name,
              peer.role AS peer_role, peer.color AS peer_color,
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
    commands: commandCatalog(rankOf(user.role)),
  }
}

async function hydrateMessage(id) {
  const { rows } = await q(
    `SELECT m.*, u.display_name, u.role, u.color
       FROM messages m LEFT JOIN users u ON u.id = m.author_id
      WHERE m.id = $1`,
    [id],
  )
  return publicMessage(rows[0])
}

async function listMessages(column, id) {
  const { rows } = await q(
    `SELECT m.*, u.display_name, u.role, u.color
       FROM messages m LEFT JOIN users u ON u.id = m.author_id
      WHERE m.${column} = $1
      ORDER BY m.id DESC
      LIMIT 80`,
    [id],
  )
  return rows.reverse().map(publicMessage)
}

async function checkCanSpeak(user, channel) {
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

router.get('/channels/:id/messages', requireAuth, async (req, res) => {
  res.json({ messages: await listMessages('channel_id', Number(req.params.id)) })
})

router.post('/channels/:id/messages', requireAuth, async (req, res) => {
  const channelId = Number(req.params.id)
  const content = String(req.body?.content ?? '').trim()
  if (!content) return res.status(400).json({ error: 'Type a message first.' })

  const { rows } = await q('SELECT * FROM channels WHERE id = $1', [channelId])
  const channel = rows[0]
  if (!channel) return res.status(404).json({ error: 'That channel no longer exists.' })

  const blocked = await checkCanSpeak(req.user, channel)
  if (blocked) return res.status(blocked.status).json({ error: blocked.error })

  if (content.startsWith('/')) {
    const outcome = await runCommand({ actor: req.user, channel, content })
    if (outcome.error) return res.status(400).json({ error: outcome.error })
    return res.json({ ok: true })
  }

  if (content.length > 2000) {
    return res.status(400).json({ error: 'Messages top out at 2000 characters.' })
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
  const peerId = Number(req.params.userId)
  if (peerId === req.user.id) return res.status(400).json({ error: 'You cannot direct message yourself.' })

  const peer = await q('SELECT id FROM users WHERE id = $1', [peerId])
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
  const threadId = Number(req.params.threadId)
  const member = await q('SELECT 1 FROM dm_members WHERE thread_id = $1 AND user_id = $2', [
    threadId,
    req.user.id,
  ])
  if (!member.rows.length) return res.status(403).json({ error: 'That conversation is not yours.' })
  res.json({ messages: await listMessages('thread_id', threadId) })
})

router.post('/dm/:threadId/messages', requireAuth, async (req, res) => {
  const threadId = Number(req.params.threadId)
  const content = String(req.body?.content ?? '').trim()
  const member = await q('SELECT 1 FROM dm_members WHERE thread_id = $1 AND user_id = $2', [
    threadId,
    req.user.id,
  ])
  if (!member.rows.length) return res.status(403).json({ error: 'That conversation is not yours.' })
  if (!content) return res.status(400).json({ error: 'Type a message first.' })
  if (content.length > 2000) return res.status(400).json({ error: 'Messages top out at 2000 characters.' })

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
  const friendId = Number(req.params.userId)
  if (friendId === req.user.id) return res.status(400).json({ error: 'You cannot add yourself.' })

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
