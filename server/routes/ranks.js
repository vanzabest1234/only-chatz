import { Router } from 'express'
import { q } from '../db.js'
import { requireAuth } from '../auth.js'
import { emitAll, emitTo } from '../realtime.js'
import { audit, take } from '../guard.js'
import { accrueCoins, coinText } from '../coins.js'
import { buyRank, rankShop } from '../ranks.js'
import { labelFor } from '../roles.js'

const router = Router()

// The shop's prices and which ranks you may still buy, read fresh so a second tab's
// purchase is reflected the moment the panel opens.
router.get('/ranks', requireAuth, async (req, res) => {
  const { state } = await accrueCoins(req.user.id)
  const { rows } = await q('SELECT role, ranks_bought FROM users WHERE id = $1', [req.user.id])
  res.json({ ...rankShop(rows[0] ?? req.user), coins: state })
})

router.post('/ranks/buy', requireAuth, async (req, res) => {
  if (!take(`ranks-buy:${req.user.id}`, 6, 60_000).ok) {
    return res.status(429).json({ error: 'The rank clerk needs a moment — try again shortly.' })
  }

  const role = String(req.body?.role ?? '').toLowerCase().replace(/\s+/g, '-')

  // Coins banked since the last look still count, so a purse is never short by one drip.
  await accrueCoins(req.user.id)

  const bought = await buyRank(req.user.id, role)
  if (bought.missing) return res.status(404).json({ error: 'That account is not around any more.' })
  if (bought.refused) return res.status(400).json({ error: bought.refused })
  if (bought.short) {
    return res.status(402).json({ error: `You need ${coinText(bought.price)} royal coins for that rank.` })
  }
  if (bought.retry) return res.status(409).json({ error: 'Your price moved — open the shop again.' })

  audit('rank-bought', { actor: req.user.username, role, price: bought.price })
  emitTo(`user:${req.user.id}`, 'coins:update', bought.coins)
  // Everyone re-reads their snapshot so the new rank shows on this name at once.
  emitAll('members:refresh')

  res.json({
    ...bought,
    message: `You are now ${labelFor(bought.role)}.`,
  })
})

export default router
