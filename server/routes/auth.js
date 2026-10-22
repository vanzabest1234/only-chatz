import { Router } from 'express'
import { q } from '../db.js'
import {
  MAX_PASSWORD,
  MIN_PASSWORD,
  createSession,
  destroySession,
  hashPassword,
  tokenFromRequest,
  verifyPassword,
} from '../auth.js'
import { audit, clearFailures, clientIp, limiter, lockoutSeconds, recordFailure } from '../guard.js'
import { checkDisplayName } from '../names.js'
import { emitAll } from '../realtime.js'
import { publicUser } from '../serializers.js'

const router = Router()
const COLORS = ['#93c5fd', '#fca5a5', '#a7f3d0', '#fcd34d', '#c4b5fd', '#f9a8d4', '#7dd3fc', '#fdba74']
const clean = value => String(value ?? '').trim()

router.post('/register', limiter('register', 10, 60 * 60_000), async (req, res) => {
  const username = clean(req.body?.username).toLowerCase()
  const password = String(req.body?.password ?? '')

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username needs 3-20 letters, numbers or underscores.' })
  }
  if (password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Password needs at least ${MIN_PASSWORD} characters.` })
  }
  if (password.length > MAX_PASSWORD) {
    return res.status(400).json({ error: `Password can be at most ${MAX_PASSWORD} characters.` })
  }
  if (password.toLowerCase() === username) {
    return res.status(400).json({ error: 'Pick a password that is not your username.' })
  }

  const named = await checkDisplayName(clean(req.body?.displayName) || username, 0)
  if (named.error) return res.status(400).json({ error: named.error })
  const displayName = named.name

  const existing = await q('SELECT 1 FROM users WHERE username = $1', [username])
  if (existing.rows.length) return res.status(409).json({ error: 'That username is already taken.' })

  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  const passwordHash = await hashPassword(password)
  // The first account on a fresh server owns it; everyone after that starts as a member.
  // A unique index on role = 'owner' settles two simultaneous first signups: the loser
  // simply registers as a member instead of creating a second owner.
  const owners = await q("SELECT 1 FROM users WHERE role = 'owner' LIMIT 1")
  const role = owners.rows.length ? 'member' : 'owner'

  const insert = async assignedRole =>
    q(
      `INSERT INTO users (username, display_name, password_hash, role, color)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [username, displayName, passwordHash, assignedRole, color],
    )

  let rows
  try {
    ;({ rows } = await insert(role))
  } catch (error) {
    if (error.constraint === 'users_single_owner' && role === 'owner') {
      ;({ rows } = await insert('member'))
    } else if (error.constraint === 'users_username_key') {
      return res.status(409).json({ error: 'That username is already taken.' })
    } else {
      throw error
    }
  }

  const token = await createSession(rows[0].id)
  emitAll('members:refresh')
  res.json({ token, user: publicUser(rows[0]) })
})

router.post('/login', limiter('login', 30, 5 * 60_000), async (req, res) => {
  const username = clean(req.body?.username).toLowerCase()
  const password = String(req.body?.password ?? '')
  const ip = clientIp(req)
  const key = `login:${ip}:${username}`

  const wait = lockoutSeconds(key)
  if (wait > 0) {
    audit('login-locked', { username, ip })
    res.set('Retry-After', String(wait))
    return res.status(429).json({ error: `Too many attempts — try again in ${wait}s.` })
  }

  if (!username || password.length > MAX_PASSWORD) {
    recordFailure(key)
    return res.status(401).json({ error: 'Wrong username or password.' })
  }

  const { rows } = await q('SELECT * FROM users WHERE username = $1', [username])
  const user = rows[0]
  const valid = await verifyPassword(password, user?.password_hash)
  if (!user || !valid) {
    const entry = recordFailure(key)
    if (entry.failures >= 5) audit('login-failed', { username, ip, failures: entry.failures })
    return res.status(401).json({ error: 'Wrong username or password.' })
  }
  if (user.banned) return res.status(403).json({ error: 'This account has been banned.' })

  clearFailures(key)
  const token = await createSession(user.id)
  res.json({ token, user: publicUser(user) })
})

router.post('/logout', async (req, res) => {
  await destroySession(tokenFromRequest(req))
  res.json({ ok: true })
})

export default router
