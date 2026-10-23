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

const router = Router()

// One turn of the wheel a day is what keeps the 1% and 0.01% slices worth something.
// The season pass can add tokens, which are spent instead of waiting.
const COOLDOWN_HOURS = 24
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000

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

const readyAt = user =>
  user.flair_spun_at ? new Date(new Date(user.flair_spun_at).getTime() + COOLDOWN_MS) : null

async function freshUser(userId) {
  const { rows } = await q('SELECT * FROM users WHERE id = $1', [userId])
  return rows[0]
}

router.get('/flairs', requireAuth, async (req, res) => {
  await grantOwnerWheel(req.user)
  await ensureOwnerSeason(req.user)
  const user = (await freshUser(req.user.id)) ?? req.user
  res.json({
    catalog: flairCatalog(),
    owned: await ownedFlairs(user.id),
    maxEquipped: MAX_EQUIPPED,
    spinTokens: user.spin_tokens ?? 0,
    customTag: user.custom_tag ?? null,
    nextSpinAt: readyAt(user)?.toISOString() ?? null,
    cooldownHours: COOLDOWN_HOURS,
  })
})

router.post('/flairs/spin', requireAuth, async (req, res) => {
  await grantOwnerWheel(req.user)
  await ensureOwnerSeason(req.user)
  const user = (await freshUser(req.user.id)) ?? req.user

  let nextSpinAt = null
  const wait = readyAt(user)
  if (wait && wait.getTime() > Date.now()) {
    // Out of turns for today: spend a pass token if one is banked, otherwise wait.
    const spent = await q(
      'UPDATE users SET spin_tokens = spin_tokens - 1 WHERE id = $1 AND spin_tokens > 0 RETURNING spin_tokens',
      [user.id],
    )
    if (!spent.rows.length) {
      const minutes = Math.ceil((wait.getTime() - Date.now()) / 60_000)
      return res.status(429).json({
        error: `The wheel is recharging — try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        nextSpinAt: wait.toISOString(),
      })
    }
    nextSpinAt = wait.getTime()
  } else {
    // Claim the turn before rolling, so two open tabs cannot both spin on one cooldown.
    const cutoff = new Date(Date.now() - COOLDOWN_MS)
    const claim = await q(
      `UPDATE users SET flair_spun_at = now()
        WHERE id = $1 AND (flair_spun_at IS NULL OR flair_spun_at <= $2)
        RETURNING flair_spun_at`,
      [user.id, cutoff],
    )
    if (!claim.rows.length) {
      return res.status(429).json({ error: 'The wheel is still recharging.' })
    }
    nextSpinAt = new Date(claim.rows[0].flair_spun_at).getTime() + COOLDOWN_MS
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

  res.json({
    won: { key: won.key, label: won.label },
    duplicate: inserted.rows.length === 0,
    owned: await ownedFlairs(user.id),
    maxEquipped: MAX_EQUIPPED,
    spinTokens: fresh.spin_tokens ?? 0,
    customTag: fresh.custom_tag ?? null,
    nextSpinAt,
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
