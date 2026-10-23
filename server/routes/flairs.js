import { Router } from 'express'
import { q } from '../db.js'
import { requireAuth } from '../auth.js'
import { emitAll, emitTo } from '../realtime.js'
import {
  CUSTOM_FLAIR,
  FLAIR_KEYS,
  MAX_EQUIPPED,
  ensureCustomTag,
  flairCatalog,
  grantOwnerWheel,
  rollFlair,
} from '../flairs.js'
import { ensureOwnerSeason } from '../pass.js'
import { SPIN_COST, accrueCoins, coinState, spendCoins } from '../coins.js'

const router = Router()

async function ownedFlairs(userId) {
  const { rows } = await q(
    'SELECT flair, equipped, obtained_at FROM user_flairs WHERE user_id = $1 ORDER BY obtained_at, flair',
    [userId],
  )
  return rows.map(row => ({
    flair: row.flair,
    equipped: row.equipped,
    obtainedAt: row.obtained_at,
  }))
}

async function freshUser(userId) {
  const { rows } = await q('SELECT * FROM users WHERE id = $1', [userId])
  return rows[0]
}

router.get('/flairs', requireAuth, async (req, res) => {
  await grantOwnerWheel(req.user)
  await ensureOwnerSeason(req.user)
  const user = (await freshUser(req.user.id)) ?? req.user
  const { state: coins } = await accrueCoins(user.id)
  res.json({
    catalog: flairCatalog(),
    owned: await ownedFlairs(user.id),
    maxEquipped: MAX_EQUIPPED,
    spinTokens: user.spin_tokens ?? 0,
    customTag: user.custom_tag ?? null,
    coins,
  })
})

router.post('/flairs/spin', requireAuth, async (req, res) => {
  await grantOwnerWheel(req.user)
  await ensureOwnerSeason(req.user)
  const user = (await freshUser(req.user.id)) ?? req.user

  // A turn is paid for: a banked pass token is spent first, otherwise 1000 Royal Coins.
  // The charge is claimed before the roll, so two open tabs cannot spend one payment twice.
  await accrueCoins(user.id)
  let coins = null
  if ((user.spin_tokens ?? 0) > 0) {
    const { rows: spent } = await q(
      `UPDATE users SET spin_tokens = spin_tokens - 1
        WHERE id = $1 AND spin_tokens > 0
        RETURNING royal_coins, coins_claimed_at`,
      [user.id],
    )
    if (spent.length) coins = coinState(spent[0])
  }
  if (!coins) coins = await spendCoins(user.id, SPIN_COST)
  if (!coins) {
    const { state } = await accrueCoins(user.id)
    return res.status(402).json({
      error: `A turn of the wheel costs ${SPIN_COST} royal coins — you hold ${state.coins}.`,
      coins: state,
    })
  }

  const won = rollFlair()
  // A flair is worn only when a slot is free; the rest stay owned and can be swapped in.
  const { rows: worn } = await q(
    'SELECT count(*)::int AS n FROM user_flairs WHERE user_id = $1 AND equipped',
    [user.id],
  )
  const inserted = await q(
    `INSERT INTO user_flairs (user_id, flair, equipped) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, flair) DO NOTHING RETURNING flair`,
    [user.id, won.key, (worn[0]?.n ?? 0) < MAX_EQUIPPED],
  )
  if (won.key === CUSTOM_FLAIR) await ensureCustomTag(user.id)

  const fresh = (await freshUser(user.id)) ?? user

  emitAll('members:refresh')
  emitTo(`user:${user.id}`, 'profile:update')
  emitTo(`user:${user.id}`, 'coins:update', coinState(fresh))

  res.json({
    won: { key: won.key, label: won.label },
    duplicate: inserted.rows.length === 0,
    owned: await ownedFlairs(user.id),
    maxEquipped: MAX_EQUIPPED,
    spinTokens: fresh.spin_tokens ?? 0,
    customTag: fresh.custom_tag ?? null,
    coins: coinState(fresh),
  })
})

// Wearing a flair is a toggle, and at most three can be worn at once.
router.post('/flairs/equip', requireAuth, async (req, res) => {
  const key = String(req.body?.flair ?? '')
  if (!FLAIR_KEYS.has(key)) return res.status(400).json({ error: 'Unknown flair.' })
  const equipped = Boolean(req.body?.equipped)

  if (equipped) {
    const { rows } = await q(
      'SELECT count(*)::int AS n FROM user_flairs WHERE user_id = $1 AND equipped AND flair <> $2',
      [req.user.id, key],
    )
    if ((rows[0]?.n ?? 0) >= MAX_EQUIPPED) {
      return res.status(400).json({ error: `You can wear ${MAX_EQUIPPED} flairs at once — take one off first.` })
    }
  }

  const { rows } = await q(
    'UPDATE user_flairs SET equipped = $1 WHERE user_id = $2 AND flair = $3 RETURNING flair',
    [equipped, req.user.id, key],
  )
  if (!rows.length) return res.status(400).json({ error: "You don't own that flair yet." })

  emitAll('members:refresh')
  emitTo(`user:${req.user.id}`, 'profile:update')
  res.json({ owned: await ownedFlairs(req.user.id), maxEquipped: MAX_EQUIPPED })
})

export default router
