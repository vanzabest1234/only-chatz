import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

// One flat palette of the faces and icons a room actually uses — no categories to click through,
// so picking an emoji is a single tap after the button. Every entry is a plain character that lands
// in the message text, so nothing is rendered differently on the way out.
const EMOJIS = [
  '😀', '😂', '🙂', '😉', '😍', '🥰', '😎', '🤔',
  '😅', '😭', '😤', '🥳', '😬', '🙃', '😴', '😇',
  '👍', '👎', '👏', '🙏', '💪', '🤝', '✌️', '🤞',
  '👋', '❤️', '🧡', '💚', '💙', '💜', '🖤', '💔',
  '✨', '🔥', '💯', '🎉', '🎊', '🎁', '🏆', '👑',
  '💎', '⚡', '🌙', '⭐', '🌈', '☕', '🍕', '🦄',
]

export default function EmojiPicker({ onPick, disabled }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)

  // A tap anywhere else, or Escape, puts the palette away — it should never sit over the room.
  useEffect(() => {
    if (!open) return undefined
    const away = event => {
      if (!wrap.current?.contains(event.target)) setOpen(false)
    }
    const escape = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('touchstart', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('touchstart', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className="emoji-wrap" ref={wrap}>
      <button
        type="button"
        className="attach emoji-open"
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        aria-label="Insert an emoji"
        title="Insert an emoji"
        aria-expanded={open}
      >
        <Icon name="smile" size={16} />
      </button>
      {open && (
        <div className="cmd-menu glass emoji-menu" role="dialog" aria-label="Emoji">
          {EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              className="emoji-pick"
              onClick={() => {
                onPick(emoji)
                setOpen(false)
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
