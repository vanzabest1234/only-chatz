import { useState } from 'react'
import Avatar from './Avatar'
import Icon from './Icon'
import { api } from '../api'

const COLORS = ['#93c5fd', '#fca5a5', '#a7f3d0', '#fcd34d', '#c4b5fd', '#f9a8d4', '#7dd3fc', '#fdba74']

// The browser crops the picture to a square and shrinks it to 256px, so what we
// send the API is a small data URL and the server needs no file storage.
function shrinkToAvatar(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const side = Math.min(image.width, image.height)
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      canvas
        .getContext('2d')
        .drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256)
      URL.revokeObjectURL(objectUrl)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('That picture could not be read — try a JPG or PNG.'))
    }
    image.src = objectUrl
  })
}

export default function SettingsModal({ user, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState(user.displayName)
  const [bio, setBio] = useState(user.bio || '')
  const [pronouns, setPronouns] = useState(user.pronouns || '')
  const [color, setColor] = useState(user.color)
  const [customTag, setCustomTag] = useState(user.customTag || '')
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const pickPicture = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Pick an image file.')
      return
    }
    try {
      setAvatarUrl(await shrinkToAvatar(file))
      setError('')
    } catch (problem) {
      setError(problem.message)
    }
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const data = await api('/api/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName,
          bio,
          pronouns,
          color,
          avatarUrl: avatarUrl || null,
          ...(user.ownsCustomTag ? { customTag } : {}),
        }),
      })
      onSaved(data.user)
      onClose()
    } catch (problem) {
      setError(problem.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="settings glass"
        role="dialog"
        aria-modal="true"
        aria-label="Your profile"
        onClick={event => event.stopPropagation()}
      >
        <header className="settings-head">
          <div>
            <h2>Your profile</h2>
            <p>@{user.username}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            <Icon name="close" />
          </button>
        </header>

        <div className="settings-body">
          <div className="avatar-editor">
            <Avatar name={displayName || user.displayName} color={color} size={92} src={avatarUrl} />
            <div className="avatar-actions">
              <label className="pill-btn">
                <Icon name="image" size={15} />
                <span>Upload picture</span>
                <input type="file" accept="image/*" onChange={pickPicture} hidden />
              </label>
              {avatarUrl && (
                <button className="text-btn" onClick={() => setAvatarUrl(null)}>
                  Remove picture
                </button>
              )}
              <p className="settings-hint">Square crop, JPG or PNG.</p>
            </div>
          </div>

          <label className="field">
            <span>Display name</span>
            <input
              value={displayName}
              maxLength={32}
              onChange={event => setDisplayName(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Pronouns</span>
            <input
              value={pronouns}
              maxLength={24}
              placeholder="they/them"
              onChange={event => setPronouns(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Bio</span>
            <textarea
              value={bio}
              maxLength={160}
              rows={3}
              placeholder="A line about you"
              onChange={event => setBio(event.target.value)}
            />
            <em className="settings-count">{bio.length}/160</em>
          </label>

          {user.ownsCustomTag && (
            <label className="field">
              <span>Custom tag</span>
              <input
                value={customTag}
                maxLength={16}
                placeholder="your word"
                onChange={event => setCustomTag(event.target.value)}
              />
              <em className="settings-count">the 0.01% wheel win · show it by equipping the tag</em>
            </label>
          )}

          <div className="field">
            <span>Accent colour</span>
            <div className="swatches">
              {COLORS.map(option => (
                <button
                  key={option}
                  className={`swatch ${option === color ? 'on' : ''}`}
                  style={{ background: option }}
                  onClick={() => setColor(option)}
                  aria-label={`Accent ${option}`}
                  aria-pressed={option === color}
                />
              ))}
            </div>
          </div>

          {error && <p className="auth-error">{error}</p>}

          <div className="settings-actions">
            <button className="text-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
