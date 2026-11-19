import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { emitAll, emitTo } from '../realtime.js'
import { audit, take } from '../guard.js'
import { accrueCoins, coinText } from '../coins.js'
import { buyRank, rankHoldings, rankShop } from '../ranks.js'

const router = Router()

// The shop's prices and which flairs you may still buy, read fresh so a second tab's
// purchase is reflected the moment the panel opens.
router.get('/ranks', requireAuth, async (req, res) => {
  const { state } = await accrueCoins(req.user.id)
  const row = await rankHoldings(req.user.id)
  res.json({ ...rankShop(row?.ranks_bought, row?.owned ?? []), coins: state })
})

router.post('/ranks/buy', requireAuth, async (req, res) => {
  if (!take(`ranks-buy:${req.user.id}`, 6, 60_000).ok) {
    return res.status(429).json({ error: 'The rank clerk needs a moment — try again shortly.' })
  }

  const flair = String(req.body?.flair ?? '').toLowerCase()

  // Coins banked since the last look still count, so a purse is never short by one drip.
  await accrueCoins(req.user.id)

  const bought = await buyRank(req.user.id, flair)
  if (bought.missing) return res.status(404).json({ error: 'That account is not around any more.' })
  if (bought.refused) return res.status(400).json({ error: bought.refused })
  if (bought.short) {
    return res.status(402).json({ error: `You need ${coinText(bought.price)} royal coins for that flair.` })
  }
  if (bought.retry) return res.status(409).json({ error: 'Your price moved — open the shop again.' })

  audit('rank-bought', { actor: req.user.username, flair, price: bought.price })
  emitTo(`user:${req.user.id}`, 'coins:update', bought.coins)
  // Everyone re-reads their snapshot so the new flair shows on this name at once.
  emitAll('members:refresh')

  res.json({
    ...bought,
    message: `You now hold ${bought.label}.`,
  })
})

export default router
