import { Router } from 'express'
import { q } from '../db.js'
import { requireAuth } from '../auth.js'
import { emitAll } from '../realtime.js'
import { publicUser } from '../serializers.js'
import { cleanText } from '../guard.js'
import { checkDisplayName } from '../names.js'
import { isRealImage } from '../images.js'

const router = Router()

// Avatars arrive as a data URL already cropped to 256x256 by the browser, so the
// payload stays small and no file storage or multipart parsing is needed.
const AVATAR_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/
const AVATAR_MAX_CHARS = 300000

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

  // The custom tag is a wheel reward: owning it is what allows the text to be set.
  // Its owner writes whatever they like in it — only control and invisible characters go.
  const customTagRaw = cleanText(req.body?.customTag ?? '', 21).trim()
  if (customTagRaw.length > 20) {
    return res.status(400).json({ error: 'Keep your custom tag under 20 characters.' })
  }
  if (customTagRaw) {
    const owns = await q("SELECT 1 FROM user_flairs WHERE user_id = $1 AND flair = 'custom'", [
      req.user.id,
    ])
    if (!owns.rows.length) {
      return res.status(403).json({ error: 'The custom tag is a wheel reward — win it first.' })
    }
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
            pronouns = $5, custom_tag = $6
      WHERE id = $7 RETURNING *`,
    [displayName, bio, color, avatarUrl, pronouns, customTagRaw || null, req.user.id],
  )

  emitAll('profile:update')
  res.json({ user: publicUser(rows[0]) })
})

export default router
