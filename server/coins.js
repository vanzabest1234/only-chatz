import { q } from './db.js'

// Royal Coins — the server's currency. Income is passive: 100 coins land every ten
// minutes. Nothing is paid by a timer alone, the balance is worked out from the clock
// (coins_claimed_at) whenever somebody looks, so a restart or a closed tab cannot
// double-pay and coming back later still collects.
//
// A long absence does not mint a fortune: catch-up stops after an hour's worth of
// ticks. Everything else in the economy (the wheel, the vault) only moves coins
// through spendCoins/settleBet, which check the balance in the same statement that
// spends it, so two open tabs can never spend the same coin twice.

export const COIN_PER_TICK = 100
export const TICK_MINUTES = 10
export const TICK_MS = TICK_MINUTES * 60 * 1000
export const SPIN_COST = 1000

// The house's fortune. Every owner is lifted to this balance whenever their wallet is read,
// so no bet or spin can ever leave an owner short.
export const OWNER_COINS = 999999999999999

// An hour of ticks is the most one visit can collect, however long the tab was shut.
const MAX_CATCHUP_TICKS = 60 / TICK_MINUTES

/** What the client paints: the balance, the drip rate, and when the next 100 lands. */
export function coinState(row) {
  const last = row?.coins_claimed_at ? new Date(row.coins_claimed_at).getTime() : Date.now()
  return {
    coins: Number(row?.royal_coins ?? 0),
    perTick: COIN_PER_TICK,
    tickMinutes: TICK_MINUTES,
    nextAt: new Date(last + TICK_MS).toISOString(),
    spinCost: SPIN_COST,
  }
}

/**
 * Collect every whole 10-minute window that has passed.
 * Returns `{ state, awarded }` so a caller can decide whether to broadcast.
 */
export async function accrueCoins(userId) {
  // `::text` keeps the timestamp at the database's full precision: a JS Date only holds
  // milliseconds, and comparing that back would never match a `now()` stamp.
  const { rows } = await q(
    'SELECT royal_coins, role, coins_claimed_at, coins_claimed_at::text AS claimed_text FROM users WHERE id = $1',
    [userId],
  )
  let row = rows[0]
  if (!row) return { state: coinState(null), awarded: false }

  // Owners are the house: their wallet refills on every read, so nothing can drain it.
  if (row.role === 'owner' && Number(row.royal_coins) < OWNER_COINS) {
    const { rows: topped } = await q(
      `UPDATE users SET royal_coins = $2
        WHERE id = $1 AND royal_coins < $2
        RETURNING royal_coins, role, coins_claimed_at, coins_claimed_at::text AS claimed_text`,
      [userId, OWNER_COINS],
    )
    if (topped.length) row = topped[0]
  }

  const last = new Date(row.coins_claimed_at).getTime()
  const ticks = Math.min(MAX_CATCHUP_TICKS, Math.floor((Date.now() - last) / TICK_MS))
  if (ticks <= 0) return { state: coinState(row), awarded: false }

  // Only the caller that finds the same window we read moves it, so two requests racing
  // on one due window cannot both be paid.
  const { rows: updated } = await q(
    `UPDATE users
        SET royal_coins = royal_coins + $3,
            coins_claimed_at = $4
      WHERE id = $1 AND coins_claimed_at::text = $2
      RETURNING royal_coins, coins_claimed_at`,
    [
      userId,
      row.claimed_text,
      ticks * COIN_PER_TICK,
      new Date(last + ticks * TICK_MS).toISOString(),
    ],
  )
  if (!updated.length) return { state: coinState(row), awarded: false }
  return { state: coinState(updated[0]), awarded: true }
}

/** Spend coins only if the balance covers it. Returns the new state, or null if short. */
export async function spendCoins(userId, amount) {
  const { rows } = await q(
    `UPDATE users SET royal_coins = royal_coins - $2
      WHERE id = $1 AND royal_coins >= $2
      RETURNING royal_coins, coins_claimed_at`,
    [userId, amount],
  )
  return rows.length ? coinState(rows[0]) : null
}

/** Take the stake and pay the win back in one statement, so a loss cannot leave coins stuck. */
export async function settleBet(userId, wager, payout) {
  const { rows } = await q(
    `UPDATE users SET royal_coins = royal_coins - $2 + $3
      WHERE id = $1 AND royal_coins >= $2
      RETURNING royal_coins, coins_claimed_at`,
    [userId, wager, payout],
  )
  return rows.length ? coinState(rows[0]) : null
}

/** Pay somebody coins from outside the economy (hand-outs, bonuses). */
export async function grantCoins(userId, amount) {
  const { rows } = await q(
    `UPDATE users SET royal_coins = royal_coins + $2
      WHERE id = $1
      RETURNING royal_coins, coins_claimed_at`,
    [userId, amount],
  )
  return rows.length ? coinState(rows[0]) : null
}
