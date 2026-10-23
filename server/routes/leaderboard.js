import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { topWallets } from '../coins.js'

const router = Router()

// The coin ladder the panel paints: the ten richest purses, highest first.
router.get('/leaderboard', requireAuth, async (_req, res) => {
  res.json({ leaders: await topWallets() })
})

export default router
