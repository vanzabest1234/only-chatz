import { q } from './db.js'
import { cleanName, reservedName } from './guard.js'

/**
 * One rule set for every place a person can rename themselves (/nick and the profile
 * screen): cleaned, not a reserved word, and never an existing account's @username.
 * Without the last check a member could rename themselves to someone else's handle and
 * be the one a moderator mutes.
 */
export async function checkDisplayName(raw, userId) {
  const name = cleanName(raw, 32)
  if (name.length < 2) return { error: 'Display name needs at least 2 characters.' }
  if (reservedName(name)) return { error: 'That name is reserved — pick another.' }

  const clash = await q('SELECT 1 FROM users WHERE lower(username) = lower($1) AND id <> $2 LIMIT 1', [
    name,
    userId,
  ])
  if (clash.rows.length) return { error: 'That name belongs to someone else.' }

  return { name }
}
