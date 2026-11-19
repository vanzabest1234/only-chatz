import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { emitTo } from '../realtime.js'
import { take } from '../guard.js'
import { accrueCoins, coinText, transferCoins } from '../coins.js'

const router = Router()

// Hand coins to another account. Both purses move inside coins.js, so a send either takes
// from the sender and pays the receiver, or changes nothing at all.
router.post('/coins/send', requireAuth, async (req, res) => {
  if (!take(`coins-send:${req.user.id}`, 10, 10_000).ok) {
    return res.status(429).json({ error: 'Give the purse a breath — try again in a moment.' })
  }

  const toId = Number(req.body?.toUserId)
  if (!Number.isInteger(toId)) {
    return res.status(400).json({ error: 'Pick someone to send coins to.' })
  }
  if (toId === req.user.id) {
    return res.status(400).json({ error: 'You cannot send coins to yourself.' })
  }

  // Digits only, passed on as a digit string: a purse holds more than a JS number counts
  // exactly, so nothing is rounded on the way in.
  const typed = String(req.body?.amount ?? '').replace(/[,_\s]/g, '')
  if (!/^\d+$/.test(typed) || BigInt(typed) < 1n) {
    return res.status(400).json({ error: 'Send a whole number of coins — at least 1.' })
  }
  const amount = BigInt(typed).toString()

  // Coins banked since the last look still count, so a purse is never short by one drip.
  await accrueCoins(req.user.id)

  const moved = await transferCoins(req.user.id, toId, amount)
  if (moved.short) {
    return res.status(402).json({ error: `You need ${coinText(amount)} royal coins to send that.` })
  }
  if (moved.missing) {
    return res.status(404).json({ error: 'That account is not around any more.' })
  }

  emitTo(`user:${req.user.id}`, 'coins:update', moved.sender)
  emitTo(`user:${toId}`, 'coins:update', moved.receiver)
  res.json({ coins: moved.sender, amount })
})

export default router
