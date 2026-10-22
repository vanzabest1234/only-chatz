import { Router } from 'express'
import { q } from '../db.js'
import { requireAuth } from '../auth.js'
import { emitAll } from '../realtime.js'
import { publicUser } from '../serializers.js'
import { cleanText } from '../guard.js'
import { checkDisplayName } from '../names.js'

const router = Router()

// Avatars arrive as a data URL already cropped to 256x256 by the browser, so the
// payload stays small and no file storage or multipart parsing is needed.
const AVATAR_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/
const AVATAR_MAX_CHARS = 300000

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Trust the bytes, not the label the client put in front of them. */
function isRealImage(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const head = Buffer.from(base64.slice(0, 32), 'base64')
  if (head.subarray(0, 8).equals(PNG_SIGNATURE)) return true
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true
  return head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP'
}

router.patch('/me/profile', requireAuth, async (req, res) => {
  const named = await checkDisplayName(req.body?.displayName, req.user.id)
  if (named.error) return res.status(400).json({ error: named.error })
  const displayName = named.name

  const bio = cleanText(req.body?.bio, 161).trim()
  if (bio.length > 160) {
    return res.status(400).json({ error: 'Keep your bio under 160 characters.' })
  }

  const pronouns = cleanText(req.body?.pronouns, 25).trim()
  if (pronouns.length > 24) {
    return res.status(400).json({ error: 'Keep your pronouns under 24 characters.' })
  }

  const color = String(req.body?.color ?? '').trim().toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    return res.status(400).json({ error: 'Pick one of the accent colours.' })
  }

  const avatar = req.body?.avatarUrl
  let avatarUrl = null
  if (typeof avatar === 'string' && avatar.length > 0) {
    if (!AVATAR_PATTERN.test(avatar) || !isRealImage(avatar)) {
      return res.status(400).json({ error: 'That picture could not be read — try a JPG or PNG.' })
    }
    if (avatar.length > AVATAR_MAX_CHARS) {
      return res.status(400).json({ error: 'That picture is too large — pick a smaller one.' })
    }
    avatarUrl = avatar
  }

  const { rows } = await q(
    `UPDATE users SET display_name = $1, bio = $2, color = $3, avatar_url = $4,
            pronouns = $5
      WHERE id = $6 RETURNING *`,
    [displayName, bio, color, avatarUrl, pronouns, req.user.id],
  )

  emitAll('profile:update')
  res.json({ user: publicUser(rows[0]) })
})

export default router
