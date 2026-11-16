import { q } from './db.js'
import { CUSTOM_FLAIR, MAX_EQUIPPED, WHEEL, ensureCustomTag } from './flairs.js'
import { coinState } from './coins.js'

// The rank shop sells the wheel's own flairs — the words a name wears, never a staff role.
// Every purchase costs 10,000 royal coins and each one raises the price of the next by
// another 10,000: the first flair is 10,000, the second 20,000, the third 30,000.
// `users.ranks_bought` is that counter.
export const RANK_PRICE = 10000

/** The ladder, low to high, in the order the wheel paints its slices. */
export const RANK_LADDER = WHEEL.map(flair => flair.key)

/** What the next flair costs, as digits — a purse is NUMERIC and can outgrow a JS number. */
export function rankPrice(bought = 0) {
  return String(RANK_PRICE * (Number(bought) + 1))
}

/**
 * The shop as the client reads it. The ladder is bought one rung at a time: a flair you
 * already hold is skipped, the first one you do not hold is for sale, and everything above
 * it stays locked until the one before is bought.
 */
export function rankShop(bought, owned = []) {
  const mine = new Set(owned)
  let open = true
  const ranks = WHEEL.map(flair => {
    const held = mine.has(flair.key)
    const buyable = !held && open
    if (buyable) open = false
    return { flair: flair.key, label: flair.label, held, buyable, locked: !held && !buyable }
  })
  return { price: rankPrice(bought), bought: Number(bought ?? 0), ranks }
}

/** This account's rung counter and the flairs it already holds. */
export async function rankHoldings(userId) {
  const { rows } = await q(
    `SELECT u.ranks_bought,
            ARRAY(SELECT f.flair FROM user_flairs f WHERE f.user_id = u.id) AS owned
       FROM users u
      WHERE u.id = $1 AND NOT banned`,
    [userId],
  )
  return rows[0] ?? null
}

/**
 * Buy one rung. The coins, the purchase counter and the flair all move in one statement, and
 * the flair is only claimed when the coins really left, so two tabs cannot both buy at the
 * old price and a purse can never go negative.
 */
export async function buyRank(userId, flair) {
  const row = await rankHoldings(userId)
  if (!row) return { missing: true }

  const shop = rankShop(row.ranks_bought, row.owned)
  const index = shop.ranks.findIndex(entry => entry.flair === flair)
  if (index < 0) return { refused: 'That flair is not on the ladder.' }

  const offer = shop.ranks[index]
  if (offer.locked) {
    const below = shop.ranks[index - 1]?.label ?? 'the one before it'
    return { refused: `${offer.label} is still locked — buy ${below} first.` }
  }
  if (!offer.buyable) return { refused: `You already hold ${offer.label}.` }

  const price = rankPrice(row.ranks_bought)
  const { rows: paid } = await q(
    // The owner's house purse is never deducted, so a flair is bought without a balance.
    `UPDATE users
        SET royal_coins = CASE WHEN role = 'owner' THEN royal_coins ELSE royal_coins - $2 END,
            ranks_bought = ranks_bought + 1
      WHERE id = $1
        AND NOT banned
        AND (role = 'owner' OR royal_coins >= $2)
        AND ranks_bought = $4
        AND NOT EXISTS (SELECT 1 FROM user_flairs WHERE user_id = $1 AND flair = $3)
      RETURNING royal_coins, coins_claimed_at, role, ranks_bought`,
    [userId, price, flair, Number(row.ranks_bought ?? 0)],
  )
  if (!paid.length) {
    const { rows: after } = await q('SELECT royal_coins FROM users WHERE id = $1', [userId])
    if (BigInt(String(after[0]?.royal_coins ?? 0)) < BigInt(price)) return { short: true, price }
    return { retry: true }
  }

  // Worn when a slot is free, exactly like a flair won on the wheel; otherwise it waits.
  await q(
    `INSERT INTO user_flairs (user_id, flair, equipped)
     SELECT $1, $2, (SELECT count(*) < $3 FROM user_flairs WHERE user_id = $1 AND equipped)
     ON CONFLICT (user_id, flair) DO NOTHING`,
    [userId, flair, MAX_EQUIPPED],
  )
  if (flair === CUSTOM_FLAIR) await ensureCustomTag(userId)

  const { rows: owned } = await q('SELECT flair FROM user_flairs WHERE user_id = $1', [userId])
  const mine = owned.map(entry => entry.flair)
  return {
    flair,
    label: offer.label,
    price,
    coins: coinState(paid[0]),
    owned: mine,
    shop: rankShop(paid[0].ranks_bought, mine),
  }
}
