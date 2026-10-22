import { q } from './db.js'

// Rooms start empty: no demo people, no pre-made conversations. The first account to
// register becomes the owner (see routes/auth.js). The fixed room list is re-asserted on
// every boot, so an older database also picks up the announcements room.
const CHANNELS = [
  {
    name: 'announcements',
    topic: 'Owner announcements — everyone reads, only the Owner posts',
    position: 0,
    announce: true,
  },
  { name: 'general', topic: 'Say hi and hang out', position: 1, announce: false },
  { name: 'random', topic: 'Off topic, always', position: 2, announce: false },
]

export async function seed() {
  for (const channel of CHANNELS) {
    await q(
      `INSERT INTO channels (name, topic, position, announce)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO NOTHING`,
      [channel.name, channel.topic, channel.position, channel.announce],
    )
  }
}
