import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { q } from './db.js'

const WEEK = 7 * 24 * 60 * 60 * 1000

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored ?? '').split(':')
  if (!salt || !hash) return false
  const attempt = Buffer.from(scryptSync(password, salt, 64).toString('hex'))
  const expected = Buffer.from(hash)
  return attempt.length === expected.length && timingSafeEqual(attempt, expected)
}

export async function createSession(userId) {
  const token = randomBytes(32).toString('hex')
  await q('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [
    token,
    userId,
    new Date(Date.now() + WEEK),
  ])
  return token
}

export async function destroySession(token) {
  if (!token) return
  await q('DELETE FROM sessions WHERE token = $1', [token])
}

export async function destroyUserSessions(userId) {
  await q('DELETE FROM sessions WHERE user_id = $1', [userId])
}

export async function sessionUser(token) {
  if (!token) return null
  const { rows } = await q(
    `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  )
  return rows[0] ?? null
}

export function tokenFromRequest(req) {
  const header = req.get('authorization') ?? ''
  if (!header.toLowerCase().startsWith('bearer ')) return null
  return header.slice(7).trim() || null
}

export async function requireAuth(req, res, next) {
  const token = tokenFromRequest(req)
  const user = await sessionUser(token)
  if (!user) return res.status(401).json({ error: 'Please sign in again.' })
  req.user = user
  req.token = token
  next()
}
