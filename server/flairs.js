import { randomInt } from 'node:crypto'
import { q } from './db.js'

// Collectible cosmetic flairs — "roles" in the loose sense: no permissions, no commands,
// and at most MAX_EQUIPPED of them can be worn at once. The wheel is the only way to win one.
//
// `bread` is deliberately off the wheel: the Owner hands it out with /bread instead.
// `custom` is the 0.01% slice: it does not paint a fixed word, it unlocks a tag you write.

// How many flairs one account may wear at the same time. Owned ones stay owned — this
// only caps what is shown next to the name.
export const MAX_EQUIPPED = 3

// The eight everyday flairs split whatever the two rares and the custom tag leave behind.
const COMMON = 12.36125

export const CUSTOM_FLAIR = 'custom'

export const FLAIRS = [
  { key: 'electric', label: 'Electric', wheel: true, weight: COMMON },
  { key: 'princess', label: 'Princess', wheel: true, weight: COMMON },
  { key: 'prince', label: 'Prince', wheel: true, weight: COMMON },
  { key: 'famous', label: 'Famous', wheel: true, weight: COMMON },
  { key: 'lucky', label: 'Lucky', wheel: true, weight: COMMON },
  { key: 'angel', label: 'Angel', wheel: true, weight: COMMON },
  { key: 'savior', label: 'Savior', wheel: true, weight: COMMON },
  { key: 'devil', label: 'Devil', wheel: true, weight: COMMON },
  { key: 'vip', label: 'VIP', wheel: true, weight: 1 },
  { key: 'mvp', label: 'MVP', wheel: true, weight: 0.1 },
  { key: 'custom', label: 'Custom tag', wheel: true, weight: 0.01, tag: true },
  { key: 'bread', label: 'bread', wheel: false, weight: 0 },
]

export const WHEEL = FLAIRS.filter(flair => flair.wheel)

export const FLAIR_KEYS = new Set(FLAIRS.map(flair => flair.key))

const TOTAL_WEIGHT = WHEEL.reduce((sum, flair) => sum + flair.weight, 0)

const oddsOf = weight => `${Number(((weight / TOTAL_WEIGHT) * 100).toFixed(2))}%`

/** Sent to the client so the wheel's slices and the printed odds come from one place. */
export function flairCatalog() {
  return FLAIRS.map(flair => ({
    key: flair.key,
    label: flair.label,
    wheel: flair.wheel,
    tag: Boolean(flair.tag),
    odds: flair.wheel ? oddsOf(flair.weight) : null,
  }))
}

/** Weighted pick over the wheel only; the roll happens here, never in the browser. */
export function rollFlair() {
  const target = (randomInt(0, 2 ** 32) / 2 ** 32) * TOTAL_WEIGHT
  let running = 0
  for (const flair of WHEEL) {
    running += flair.weight
    if (target < running) return flair
  }
  return WHEEL[WHEEL.length - 1]
}

/**
 * Owners hold the whole wheel — it is their server, and there is nothing left to win.
 * Missing flairs are added with only the free slots worn, so the cap still holds.
 */
export async function grantOwnerWheel(user) {
  if (user?.role !== 'owner') return
  const { rows } = await q(
    'SELECT count(*)::int AS worn FROM user_flairs WHERE user_id = $1 AND equipped',
    [user.id],
  )
  const spare = Math.max(0, MAX_EQUIPPED - (rows[0]?.worn ?? 0))
  await q(
    `INSERT INTO user_flairs (user_id, flair, equipped)
     SELECT $1, key, (ord <= $3)
       FROM unnest($2::text[]) WITH ORDINALITY AS t(key, ord)
     ON CONFLICT (user_id, flair) DO NOTHING`,
    [user.id, WHEEL.map(flair => flair.key), spare],
  )
  // A custom tag with no text would paint an empty badge.
  await q(
    `UPDATE users SET custom_tag = 'tag'
      WHERE id = $1 AND custom_tag IS NULL
        AND EXISTS (SELECT 1 FROM user_flairs WHERE user_id = $1 AND flair = 'custom')`,
    [user.id],
  )
}
