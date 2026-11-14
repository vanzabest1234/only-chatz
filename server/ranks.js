import { q } from './db.js'
import { RANKS, labelFor, rankOf } from './roles.js'
import { coinState } from './coins.js'

// The rank shop. Every rank costs 10,000 royal coins, and each one you buy raises the
// price of the next by another 10,000 — your first rank is 10,000, the second 20,000,
// the third 30,000. Owner is not for sale: it is handed out, never bought.
export const RANK_PRICE = 10000
export const BUYABLE_RANKS = ['mod', 'admin', 'co-owner']

/** What the next rank costs, as digits — a purse is NUMERIC and can outgrow a JS number. */
export function rankPrice(bought = 0) {
  return String(RANK_PRICE * (Number(bought) + 1))
}

/**
 * The shop as the client reads it: the current price and every rank, already judged.
 * The ladder is bought one rung at a time — only the first rank you do not hold is for
 * sale, and buying it unlocks the next one. Everything above stays locked.
 */
export function rankShop(row) {
  const mine = rankOf(row?.role)
  let open = row?.role !== 'owner'
  const ranks = BUYABLE_RANKS.map(role => {
    const held = mine >= RANKS[role]
    const buyable = !held && open
    if (buyable) open = false
    return { role, label: labelFor(role), held, buyable, locked: !held && !buyable }
  })
  return {
    price: rankPrice(row?.ranks_bought),
    bought: Number(row?.ranks_bought ?? 0),
    ranks,
  }
}

/**
 * Buy one rank. The balance, the new role and the price guard move in a single statement,
 * so two tabs cannot both buy at the old price and a purse can never go negative.
 */
export async function buyRank(userId, role) {
  const { rows: current } = await q(
    'SELECT role, ranks_bought FROM users WHERE id = $1 AND NOT banned',
    [userId],
  )
  const row = current[0]
  if (!row) return { missing: true }

  const shop = rankShop(row)
  const offer = shop.ranks.find(entry => entry.role === role)
  if (offer?.locked) {
    const below = shop.ranks[shop.ranks.indexOf(offer) - 1]?.label ?? 'the rank before it'
    return { refused: `${offer.label} is still locked — buy ${below} first.` }
  }
  if (!offer?.buyable) {
    return { refused: `You cannot buy the ${labelFor(role)} rank.` }
  }

  const price = rankPrice(row.ranks_bought)
  const { rows } = await q(
    `UPDATE users
        SET royal_coins = royal_coins - $2,
            role = $3,
            ranks_bought = ranks_bought + 1
      WHERE id = $1
        AND NOT banned
        AND royal_coins >= $2
        AND ranks_bought = $4
      RETURNING royal_coins, coins_claimed_at, role, ranks_bought`,
    [userId, price, role, Number(row.ranks_bought ?? 0)],
  )
  if (rows.length) {
    const fresh = rows[0]
    return { coins: coinState(fresh), role: fresh.role, shop: rankShop(fresh), price }
  }

  // Nothing moved: either the purse is short, or another purchase took the old price first.
  const { rows: after } = await q('SELECT royal_coins FROM users WHERE id = $1', [userId])
  if (BigInt(String(after[0]?.royal_coins ?? 0)) < BigInt(price)) return { short: true, price }
  return { retry: true }
}
