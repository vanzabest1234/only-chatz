import { useRef, useState } from 'react'
import Icon from './Icon'

const EMOJI = [
  '😀', '😄', '😅', '😂', '🙂', '😉', '😍', '😘',
  '😎', '🤔', '😴', '😭', '😡', '👍', '👎', '🙏',
  '🔥', '💜', '✨', '🎉', '☕', '🌙', '💀', '👀',
]

export default function Composer({ placeholder, commands, onSend, disabled, slowmode = 0 }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const area = useRef(null)

  const matches =
    value.startsWith('/') && !/\s/.test(value)
      ? commands.filter(command => `/${command.name}`.startsWith(value.toLowerCase())).slice(0, 6)
      : []

  function resize(element) {
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`
  }

  async function submit() {
    const text = value.trim()
    if (!text || busy || disabled) return
    setBusy(true)
    setError('')
    try {
      await onSend(text)
      setValue('')
      resize(area.current)
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  function pick(command) {
    setValue(`/${command.name} `)
    area.current?.focus()
  }

  function addEmoji(emoji) {
    setValue(current => current + emoji)
    setEmojiOpen(false)
    area.current?.focus()
  }

  return (
    <form
      className="composer-wrap"
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      {matches.length > 0 && (
        <div className="cmd-menu glass">
          {matches.map(command => (
            <button key={command.name} type="button" className="cmd-item" onClick={() => pick(command)}>
              <span className="cmd-name">{command.usage}</span>
              <span className="cmd-desc">{command.description}</span>
            </button>
          ))}
        </div>
      )}

      {emojiOpen && (
        <div className="emoji-pop glass">
          {EMOJI.map(emoji => (
            <button
              key={emoji}
              type="button"
              className="emoji-item"
              onClick={() => addEmoji(emoji)}
              aria-label={`Insert ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div className="composer">
        <button
          type="button"
          className="tool-btn"
          aria-label="Commands"
          title="Commands"
          onClick={() => {
            setValue(current => (current.startsWith('/') ? current : `/${current}`))
            area.current?.focus()
          }}
        >
          <Icon name="plus" size={18} />
        </button>
        <button
          type="button"
          className="tool-btn"
          aria-label="Emoji"
          title="Emoji"
          aria-expanded={emojiOpen}
          onClick={() => setEmojiOpen(open => !open)}
        >
          <Icon name="smile" size={18} />
        </button>

        <textarea
          ref={area}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={disabled ? 'You cannot post right now.' : placeholder}
          aria-label={placeholder}
          onChange={event => {
            setValue(event.target.value)
            resize(event.target)
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') setEmojiOpen(false)
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />

        <button
          className="send"
          type="submit"
          disabled={disabled || busy || !value.trim()}
          aria-label="Send message"
        >
          <Icon name="send" size={17} />
        </button>
      </div>

      <div className="composer-foot">
        {error ? (
          <span className="composer-error">{error}</span>
        ) : (
          <span>{disabled ? 'Muted by a moderator.' : 'Type / for commands · Enter to send'}</span>
        )}
        {slowmode > 0 && <span className="chip">slowmode {slowmode}s</span>}
      </div>
    </form>
  )
}
