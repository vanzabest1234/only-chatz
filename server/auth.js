import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { q } from './db.js'

const scryptAsync = promisify(scrypt)
const KEY_LEN = 64
const WEEK = 7 * 24 * 60 * 60 * 1000

export const MAX_PASSWORD = 128
export const MIN_PASSWORD = 8

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scryptAsync(password, salt, KEY_LEN)
  return `${salt}:${derived.toString('hex')}`
}

// Signing in as a user who does not exist still pays for one scrypt round, so response
// timing cannot be used to find out which usernames are registered.
const DUMMY_HASH = `${'0'.repeat(32)}:${'0'.repeat(KEY_LEN * 2)}`

export async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored ?? DUMMY_HASH).split(':')
  if (!salt || !hash) return false
  const attempt = await scryptAsync(password, salt, KEY_LEN)
  const expected = Buffer.from(hash, 'hex')
  const match = expected.length === attempt.length && timingSafeEqual(attempt, expected)
  return Boolean(stored) && match
}

// Session tokens are stored hashed: a leaked table dump cannot be replayed as logins.
const digest = token => createHash('sha256').update(String(token)).digest('hex')

const TOKEN_PATTERN = /^[a-f0-9]{64}$/

export async function createSession(userId) {
  const token = randomBytes(32).toString('hex')
  await q('DELETE FROM sessions WHERE expires_at < now()')
  await q('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [
    digest(token),
    userId,
    new Date(Date.now() + WEEK),
  ])
  return token
}

export async function destroySession(token) {
  if (!token || !TOKEN_PATTERN.test(token)) return
  await q('DELETE FROM sessions WHERE token = $1', [digest(token)])
}

export async function destroyUserSessions(userId) {
  await q('DELETE FROM sessions WHERE user_id = $1', [userId])
}

const SESSION_LOOKUP = `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > now()`

export async function sessionUser(token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null

  const hashed = digest(token)
  const { rows } = await q(SESSION_LOOKUP, [hashed])
  if (rows.length) return rows[0]

  // Sessions created before tokens were hashed are still stored in the clear; accept
  // one of those and convert the row on the spot, so nobody is signed out by the change.
  const legacy = await q(SESSION_LOOKUP, [token])
  if (!legacy.rows.length) return null
  await q('UPDATE sessions SET token = $1 WHERE token = $2', [hashed, token])
  return legacy.rows[0]
}

export function tokenFromRequest(req) {
  const header = req.get('authorization') ?? ''
  if (!header.toLowerCase().startsWith('bearer ')) return null
  const token = header.slice(7).trim()
  return TOKEN_PATTERN.test(token) ? token : null
}

export async function requireAuth(req, res, next) {
  const token = tokenFromRequest(req)
  const user = await sessionUser(token)
  if (!user) return res.status(401).json({ error: 'Please sign in again.' })
  if (user.banned) return res.status(403).json({ error: 'This account has been banned.' })
  req.user = user
  req.token = token
  next()
}
