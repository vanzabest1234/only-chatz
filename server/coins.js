import { pool, q } from './db.js'

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

// An hour of ticks is the most one visit can collect, however long the tab was shut.
const MAX_CATCHUP_TICKS = 60 / TICK_MINUTES

/** How many names the coin ladder shows. */
export const LEADERBOARD_SIZE = 10

/**
 * The richest purses, highest first. Banned accounts are gone from the server, so they are
 * gone from the ladder too; owners stay on it — the house balance they hold is real.
 */
export async function topWallets(limit = LEADERBOARD_SIZE) {
  const { rows } = await q(
    `SELECT id, username, display_name, role, color, avatar_url, royal_coins
       FROM users
      WHERE NOT banned
      ORDER BY royal_coins DESC, display_name ASC
      LIMIT $1`,
    [limit],
  )
  return rows.map((row, index) => ({
    rank: index + 1,
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    color: row.color,
    avatarUrl: row.avatar_url ?? null,
    coins: walletValue(row.royal_coins),
  }))
}

/**
 * A purse can hold more than a JS number counts exactly. Past that, the database's own digits
 * travel through untouched as a string, so nothing is rounded on the way out.
 */
function walletValue(value) {
  const text = String(value ?? 0)
  const number = Number(text)
  return Number.isSafeInteger(number) ? number : text
}

/** A balance as grouped digits, exact however large the purse is. */
export function coinText(value) {
  try {
    return BigInt(value ?? 0).toLocaleString('en-US')
  } catch {
    return Number(value ?? 0).toLocaleString('en-US')
  }
}

/** What the client paints: the balance, the drip rate, and when the next 100 lands. */
export function coinState(row) {
  const last = row?.coins_claimed_at ? new Date(row.coins_claimed_at).getTime() : Date.now()
  return {
    coins: walletValue(row?.royal_coins),
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
  const row = rows[0]
  if (!row) return { state: coinState(null), awarded: false }

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

/**
 * Move coins from one purse to another in one transaction. The sender's balance is checked by
 * the same statement that takes it, and the receiver is only paid when the coins really left,
 * so a send either moves the amount or changes nothing — coins can never vanish in between.
 */
export async function transferCoins(fromId, toId, amount) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: paid } = await client.query(
      `UPDATE users SET royal_coins = royal_coins - $2
        WHERE id = $1 AND royal_coins >= $2
        RETURNING royal_coins, coins_claimed_at`,
      [fromId, amount],
    )
    if (!paid.length) {
      await client.query('ROLLBACK')
      return { short: true }
    }
    const { rows: given } = await client.query(
      `UPDATE users SET royal_coins = royal_coins + $2
        WHERE id = $1 AND NOT banned
        RETURNING royal_coins, coins_claimed_at`,
      [toId, amount],
    )
    if (!given.length) {
      await client.query('ROLLBACK')
      return { missing: true }
    }
    await client.query('COMMIT')
    return { sender: coinState(paid[0]), receiver: coinState(given[0]) }
  } catch (problem) {
    await client.query('ROLLBACK')
    throw problem
  } finally {
    client.release()
  }
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
