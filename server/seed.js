import { q } from './db.js'

// Rooms start empty: no demo people, no pre-made conversations. The first account to
// register becomes the owner (see routes/auth.js).
const CHANNELS = [
  { name: 'general', topic: 'Say hi and hang out', position: 0 },
  { name: 'design', topic: 'Screenshots and half-formed ideas', position: 1 },
  { name: 'random', topic: 'Off topic, always', position: 2 },
]

export async function seed() {
  const { rows } = await q('SELECT count(*)::int AS total FROM channels')
  if (rows[0].total > 0) return

  for (const channel of CHANNELS) {
    await q('INSERT INTO channels (name, topic, position) VALUES ($1, $2, $3)', [
      channel.name,
      channel.topic,
      channel.position,
    ])
  }
}
