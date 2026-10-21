import { Router } from 'express'
import { q } from '../db.js'
import { hashPassword, verifyPassword, createSession, destroySession, tokenFromRequest } from '../auth.js'
import { emitAll } from '../realtime.js'
import { publicUser } from '../serializers.js'

const router = Router()
const COLORS = ['#93c5fd', '#fca5a5', '#a7f3d0', '#fcd34d', '#c4b5fd', '#f9a8d4', '#7dd3fc', '#fdba74']
const clean = value => String(value ?? '').trim()

router.post('/register', async (req, res) => {
  const username = clean(req.body?.username).toLowerCase()
  const displayName = (clean(req.body?.displayName) || username).slice(0, 32)
  const password = String(req.body?.password ?? '')

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username needs 3-20 letters, numbers or underscores.' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password needs at least 6 characters.' })
  }

  const existing = await q('SELECT 1 FROM users WHERE username = $1', [username])
  if (existing.rows.length) return res.status(409).json({ error: 'That username is already taken.' })

  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  // The first account on a fresh server owns it; everyone after that starts as a member.
  const owners = await q("SELECT 1 FROM users WHERE role = 'owner' LIMIT 1")
  const role = owners.rows.length ? 'member' : 'owner'
  const { rows } = await q(
    `INSERT INTO users (username, display_name, password_hash, role, color)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [username, displayName, hashPassword(password), role, color],
  )
  const token = await createSession(rows[0].id)
  emitAll('members:refresh')
  res.json({ token, user: publicUser(rows[0]) })
})

router.post('/login', async (req, res) => {
  const username = clean(req.body?.username).toLowerCase()
  const password = String(req.body?.password ?? '')
  const { rows } = await q('SELECT * FROM users WHERE username = $1', [username])
  const user = rows[0]
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Wrong username or password.' })
  }
  if (user.banned) return res.status(403).json({ error: 'This account has been banned.' })

  const token = await createSession(user.id)
  res.json({ token, user: publicUser(user) })
})

router.post('/logout', async (req, res) => {
  await destroySession(tokenFromRequest(req))
  res.json({ ok: true })
})

export default router
