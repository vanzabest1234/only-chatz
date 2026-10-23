import { randomInt } from 'node:crypto'

// Collectible cosmetic flairs — "roles" in the loose sense: no permissions, no commands,
// and any number of them can be worn at once. The wheel is the only way to win one.
//
// `bread` is deliberately off the wheel: the Owner hands it out with /bread instead.

// The eight everyday flairs split whatever the two rares leave behind (98.9%).
const COMMON = 12.3625

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
