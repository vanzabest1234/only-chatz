import { Router } from 'express'
import { q } from '../db.js'
import { requireAuth } from '../auth.js'
import { emitTo } from '../realtime.js'
import { take } from '../guard.js'
import { accrueCoins, settleBet } from '../coins.js'
import { MAX_BET, MIN_BET, RISKS, payoutFor, riskByKey, rollDice } from '../casino.js'

const router = Router()

async function recentBets(userId) {
  const { rows } = await q(
    `SELECT wager, risk, roll, won, payout, created_at
       FROM coin_bets WHERE user_id = $1 ORDER BY id DESC LIMIT 6`,
    [userId],
  )
  return rows.map(row => ({
    wager: row.wager,
    risk: row.risk,
    roll: row.roll,
    won: row.won,
    payout: row.payout,
    at: row.created_at,
  }))
}

// The table's rules and the player's own balance, so the panel opens on real numbers.
router.get('/casino', requireAuth, async (req, res) => {
  const { state } = await accrueCoins(req.user.id)
  res.json({
    risks: RISKS,
    minBet: MIN_BET,
    maxBet: MAX_BET,
    coins: state,
    bets: await recentBets(req.user.id),
  })
})

router.post('/casino/bet', requireAuth, async (req, res) => {
  // The vault answers instantly, so it is the easiest place to spin a script against.
  if (!take(`casino:${req.user.id}`, 20, 10_000).ok) {
    return res.status(429).json({ error: 'Give the table a breath — try again in a moment.' })
  }

  const risk = riskByKey(String(req.body?.risk ?? ''))
  if (!risk) return res.status(400).json({ error: 'Pick one of the table stakes first.' })

  const wager = Math.floor(Number(req.body?.wager))
  if (!Number.isFinite(wager) || wager < MIN_BET) {
    return res.status(400).json({ error: `The smallest stake is ${MIN_BET} coins.` })
  }
  if (wager > MAX_BET) {
    return res.status(400).json({ error: `The biggest stake is ${MAX_BET} coins.` })
  }

  // Coins banked since the last look still count, so a player never loses a window.
  await accrueCoins(req.user.id)

  const { roll, won } = rollDice(risk.chance)
  const payout = won ? payoutFor(risk, wager) : 0
  // Stake and payout move together: a refused stake (not enough coins) rolls nothing.
  const coins = await settleBet(req.user.id, wager, payout)
  if (!coins) {
    return res.status(402).json({ error: `You need ${wager} royal coins to place that stake.` })
  }

  await q(
    `INSERT INTO coin_bets (user_id, wager, risk, roll, won, payout)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [req.user.id, wager, risk.key, roll, won, payout],
  )

  emitTo(`user:${req.user.id}`, 'coins:update', coins)
  res.json({
    roll,
    won,
    chance: risk.chance,
    risk: risk.key,
    wager,
    payout,
    coins,
    bets: await recentBets(req.user.id),
  })
})

export default router
