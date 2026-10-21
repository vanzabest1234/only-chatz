import { q } from './db.js'
import { hashPassword } from './auth.js'

const USERS = [
  { username: 'zara', display: 'Zara', role: 'owner', color: '#ffd479' },
  { username: 'milo', display: 'Milo', role: 'co-owner', color: '#b39dff' },
  { username: 'ada', display: 'Ada', role: 'admin', color: '#ff8fab' },
  { username: 'kai', display: 'Kai', role: 'mod', color: '#5eead4' },
  { username: 'juno', display: 'Juno', role: 'member', color: '#93c5fd' },
  { username: 'remy', display: 'Remy', role: 'member', color: '#fca5a5' },
]

const CHANNELS = [
  { name: 'general', topic: 'Say hi and hang out', position: 0 },
  { name: 'design', topic: 'Screenshots and half-formed ideas', position: 1 },
  { name: 'random', topic: 'Off topic, always', position: 2 },
]

const CHANNEL_CHAT = [
  ['general', 'zara', 'Morning everyone, welcome to Only Chatz.', 54],
  ['general', 'milo', 'The floaty panels are live. Tell me they do not feel like a cloud.', 51],
  ['general', 'kai', 'They float. I have been staring at the composer for a solid minute.', 49],
  ['general', 'juno', 'the role badges are so clean', 46],
  ['general', 'ada', 'Reminder that mods are around if anything feels off.', 41],
  ['general', 'remy', 'anyone up for a late one tonight?', 14],
  ['design', 'milo', 'Softened the glass to 24px blur. Same contrast, gentler edges.', 33],
  ['design', 'ada', 'Reads fine on mobile now.', 29],
  ['random', 'juno', 'coffee count today: four', 62],
]

export async function seed() {
  const { rows } = await q('SELECT count(*)::int AS total FROM users')
  if (rows[0].total > 0) return

  for (const user of USERS) {
    await q(
      'INSERT INTO users (username, display_name, password_hash, role, color) VALUES ($1, $2, $3, $4, $5)',
      [user.username, user.display, hashPassword(`${user.username}123`), user.role, user.color],
    )
  }

  for (const channel of CHANNELS) {
    await q('INSERT INTO channels (name, topic, position) VALUES ($1, $2, $3)', [
      channel.name,
      channel.topic,
      channel.position,
    ])
  }

  for (const [channelName, username, content, minutesAgo] of CHANNEL_CHAT) {
    const author = await q('SELECT * FROM users WHERE username = $1', [username])
    const channel = await q('SELECT id FROM channels WHERE name = $1', [channelName])
    await q(
      `INSERT INTO messages (channel_id, author_id, author_name, author_role, content, created_at)
       VALUES ($1, $2, $3, $4, $5, now() - ($6 || ' minutes')::interval)`,
      [
        channel.rows[0].id,
        author.rows[0].id,
        author.rows[0].display_name,
        author.rows[0].role,
        content,
        String(minutesAgo),
      ],
    )
  }

  const kai = await q("SELECT id FROM users WHERE username = 'kai'")
  const juno = await q("SELECT id FROM users WHERE username = 'juno'")
  const thread = await q('INSERT INTO dm_threads DEFAULT VALUES RETURNING id')
  await q('INSERT INTO dm_members (thread_id, user_id) VALUES ($1, $2), ($1, $3)', [
    thread.rows[0].id,
    kai.rows[0].id,
    juno.rows[0].id,
  ])
  await q(
    `INSERT INTO messages (thread_id, author_id, author_name, author_role, content, created_at)
     VALUES ($1, $2, 'Juno', 'member', 'hey, are you around?', now() - interval '18 minutes')`,
    [thread.rows[0].id, juno.rows[0].id],
  )
  await q(
    `INSERT INTO messages (thread_id, author_id, author_name, author_role, content, created_at)
     VALUES ($1, $2, 'Kai', 'mod', 'always. what is up?', now() - interval '16 minutes')`,
    [thread.rows[0].id, kai.rows[0].id],
  )

  await q('INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1)', [
    kai.rows[0].id,
    juno.rows[0].id,
  ])
}
