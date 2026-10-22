// Anti-cheat guard: dependency-free rate limits, login lockouts, input cleaning and a
// small audit trail. Everything lives in process memory, so an API restart clears it —
// that is fine for this app (a restart already drops every socket and presence entry).

const MAX_ENTRIES = 5000
const AUDIT_LIMIT = 200

const buckets = new Map() // key -> { count, resetAt }
const lockouts = new Map() // key -> { failures, until }
const auditTrail = []

function sweep(map) {
  if (map.size < MAX_ENTRIES) return
  const now = Date.now()
  for (const [key, entry] of map) {
    const expiry = entry.resetAt ?? entry.until ?? 0
    if (expiry && expiry <= now) map.delete(key)
  }
}

/** Count one hit against a fixed window. Returns whether it is still inside the limit. */
export function take(key, limit, windowMs = 60_000) {
  const now = Date.now()
  sweep(buckets)
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }
  current.count += 1
  if (current.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) }
  }
  return { ok: true, retryAfter: 0 }
}

export function lockoutSeconds(key) {
  const entry = lockouts.get(key)
  if (!entry) return 0
  const left = entry.until - Date.now()
  return left > 0 ? Math.ceil(left / 1000) : 0
}

/** Remember a failed sign-in; the lockout doubles with every extra failure. */
export function recordFailure(key, { threshold = 5, baseMs = 30_000, maxMs = 15 * 60_000 } = {}) {
  const entry = lockouts.get(key) ?? { failures: 0, until: 0 }
  entry.failures += 1
  if (entry.failures >= threshold) {
    const steps = entry.failures - threshold
    entry.until = Date.now() + Math.min(baseMs * 2 ** steps, maxMs)
  }
  lockouts.set(key, entry)
  return entry
}

export function clearFailures(key) {
  lockouts.delete(key)
}

/** The proxy in front of the API forwards the caller's address, so prefer that. */
export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim()
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown'
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g

/**
 * Drop control characters and invisible/bidi tricks, then cap the length. Zero-width
 * and right-to-left override characters are how a display name gets dressed up to look
 * like somebody else's, so they never reach the database.
 */
export function cleanText(value, max) {
  const flat = String(value ?? '')
    .replace(CONTROL, '')
    .replace(INVISIBLE, '')
    .replace(/\r\n/g, '\n')
  return max ? flat.slice(0, max) : flat
}

export function cleanName(value, max = 32) {
  return cleanText(value, max).replace(/\s+/g, ' ').trim()
}

// Names that pretend to be the server itself or a rank badge.
const RESERVED = new Set([
  'only chatz',
  'onlychatz',
  'system',
  'server',
  'admin',
  'administrator',
  'owner',
  'co owner',
  'mod',
  'moderator',
  'member',
  'everyone',
  'here',
])

export function reservedName(name) {
  return RESERVED.has(
    String(name ?? '')
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ')
      .trim(),
  )
}

/** Log a suspicious or privileged action; the Owner can read this through /api/audit. */
export function audit(event, details = {}) {
  const entry = { at: new Date().toISOString(), event, ...details }
  auditTrail.push(entry)
  if (auditTrail.length > AUDIT_LIMIT) auditTrail.shift()
  console.warn('[audit]', event, JSON.stringify(details))
  return entry
}

export function recentAudit() {
  return [...auditTrail].reverse()
}

/** Express middleware: per-IP fixed-window limit with a Retry-After header. */
export function limiter(name, limit, windowMs = 60_000) {
  return (req, res, next) => {
    const ip = clientIp(req)
    const result = take(`${name}:${ip}`, limit, windowMs)
    if (result.ok) return next()
    // One audit line per offending address per minute, so a flood cannot fill the trail.
    if (take(`audit:${name}:${ip}`, 1, 60_000).ok) audit('rate-limit', { name, ip })
    res.set('Retry-After', String(result.retryAfter))
    res.status(429).json({ error: `Too many requests — try again in ${result.retryAfter}s.` })
  }
}
