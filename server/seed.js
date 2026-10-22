import { q } from './db.js'

// Rooms start empty: no demo people, no pre-made conversations. The first account to
// register becomes the owner (see routes/auth.js). The fixed room list is re-asserted on
// every boot (positions included), so an older database picks up new rooms and room order.
const CHANNELS = [
  { name: 'general', topic: 'Say hi and hang out', position: 0, announce: false },
  {
    name: 'announcements',
    topic: 'Owner announcements — everyone reads, only the Owner posts',
    position: 1,
    announce: true,
  },
  { name: 'random', topic: 'Off topic, always', position: 2, announce: false },
]

export async function seed() {
  for (const channel of CHANNELS) {
    await q(
      `INSERT INTO channels (name, topic, position, announce)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET position = EXCLUDED.position`,
      [channel.name, channel.topic, channel.position, channel.announce],
    )
  }
}
