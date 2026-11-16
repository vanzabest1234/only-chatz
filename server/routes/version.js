import { Router } from 'express'
import { sourceBuild } from '../build.js'

const router = Router()

// Public and unauthenticated: the sign-in screen polls it too. The value only ever moves when
// the code changed, so an open tab reloads itself onto the new build.
router.get('/version', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ build: sourceBuild() })
})

export default router
