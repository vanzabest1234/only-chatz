import { Router } from 'express'
import { q } from '../db.js'
import { requireAuth } from '../auth.js'
import { emitAll, emitTo } from '../realtime.js'
import { FLAIR_KEYS, flairCatalog, rollFlair } from '../flairs.js'

const router = Router()

// One turn of the wheel a day is what keeps the 1% and 0.1% slices worth something.
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

router.get('/flairs', requireAuth, async (req, res) => {
  res.json({
    catalog: flairCatalog(),
    owned: await ownedFlairs(req.user.id),
    nextSpinAt: readyAt(req.user)?.toISOString() ?? null,
    cooldownHours: COOLDOWN_HOURS,
  })
})

router.post('/flairs/spin', requireAuth, async (req, res) => {
  const wait = readyAt(req.user)
  if (wait && wait.getTime() > Date.now()) {
    const minutes = Math.ceil((wait.getTime() - Date.now()) / 60_000)
    return res.status(429).json({
      error: `The wheel is recharging — try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      nextSpinAt: wait.toISOString(),
    })
  }

  // Claim the turn before rolling, so two open tabs cannot both spin on one cooldown.
  const cutoff = new Date(Date.now() - COOLDOWN_MS)
  const claim = await q(
    `UPDATE users SET flair_spun_at = now()
      WHERE id = $1 AND (flair_spun_at IS NULL OR flair_spun_at <= $2)
      RETURNING flair_spun_at`,
    [req.user.id, cutoff],
  )
  if (!claim.rows.length) {
    return res.status(429).json({ error: 'The wheel is still recharging.' })
  }

  const won = rollFlair()
  const inserted = await q(
    `INSERT INTO user_flairs (user_id, flair, equipped) VALUES ($1, $2, TRUE)
     ON CONFLICT (user_id, flair) DO NOTHING RETURNING flair`,
    [req.user.id, won.key],
  )

  emitAll('members:refresh')
  emitTo(`user:${req.user.id}`, 'profile:update')

  res.json({
    won: { key: won.key, label: won.label },
    duplicate: inserted.rows.length === 0,
    owned: await ownedFlairs(req.user.id),
    nextSpinAt: new Date(claim.rows[0].flair_spun_at).getTime() + COOLDOWN_MS,
  })
})

// Wearing one is a toggle and there is no limit: several flairs can be equipped at once.
router.post('/flairs/equip', requireAuth, async (req, res) => {
  const key = String(req.body?.flair ?? '')
  if (!FLAIR_KEYS.has(key)) return res.status(400).json({ error: 'Unknown flair.' })
  const equipped = Boolean(req.body?.equipped)

  const { rows } = await q(
    'UPDATE user_flairs SET equipped = $1 WHERE user_id = $2 AND flair = $3 RETURNING flair',
    [equipped, req.user.id, key],
  )
  if (!rows.length) return res.status(400).json({ error: "You don't own that flair yet." })

  emitAll('members:refresh')
  emitTo(`user:${req.user.id}`, 'profile:update')
  res.json({ owned: await ownedFlairs(req.user.id) })
})

export default router
