import { Router } from 'express'
import { q } from '../db.js'
import { requireAuth } from '../auth.js'
import { emitAll } from '../realtime.js'
import { publicUser } from '../serializers.js'

const router = Router()

// Avatars arrive as a data URL already cropped to 256x256 by the browser, so the
// payload stays small and no file storage or multipart parsing is needed.
const AVATAR_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/
const AVATAR_MAX_CHARS = 300000

router.patch('/me/profile', requireAuth, async (req, res) => {
  const displayName = String(req.body?.displayName ?? '').trim()
  const bio = String(req.body?.bio ?? '').trim()
  const color = String(req.body?.color ?? '').trim().toLowerCase()
  const avatar = req.body?.avatarUrl

  if (displayName.length < 2 || displayName.length > 32) {
    return res.status(400).json({ error: 'Display name needs 2-32 characters.' })
  }
  if (bio.length > 160) {
    return res.status(400).json({ error: 'Keep your bio under 160 characters.' })
  }
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    return res.status(400).json({ error: 'Pick one of the accent colours.' })
  }

  let avatarUrl = null
  if (typeof avatar === 'string' && avatar.length > 0) {
    if (!AVATAR_PATTERN.test(avatar)) {
      return res.status(400).json({ error: 'That picture could not be read — try a JPG or PNG.' })
    }
    if (avatar.length > AVATAR_MAX_CHARS) {
      return res.status(400).json({ error: 'That picture is too large — pick a smaller one.' })
    }
    avatarUrl = avatar
  }

  const { rows } = await q(
    `UPDATE users SET display_name = $1, bio = $2, color = $3, avatar_url = $4
      WHERE id = $5 RETURNING *`,
    [displayName, bio, color, avatarUrl, req.user.id],
  )

  emitAll('profile:update')
  res.json({ user: publicUser(rows[0]) })
})

export default router
