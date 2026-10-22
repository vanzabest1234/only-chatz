import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

export default function Composer({
  placeholder,
  commands,
  onSend,
  disabled,
  disabledNote,
  slowmode = 0,
  replyTo,
  onCancelReply,
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const area = useRef(null)

  // Picking "reply" is a request to type, so the cursor goes straight to the box.
  useEffect(() => {
    if (replyTo) area.current?.focus()
  }, [replyTo?.id])

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
      // A short beat before the message leaves, so a send is never instant.
      await new Promise(resolve => setTimeout(resolve, 1000))
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

      {replyTo && (
        <div className="composer-reply">
          <span className="reply-arrow">↰</span>
          <span className="reply-who">{replyTo.authorName}</span>
          <span className="reply-text">{replyTo.content}</span>
          <button
            type="button"
            className="reply-cancel"
            onClick={onCancelReply}
            aria-label="Cancel reply"
          >
            ×
          </button>
        </div>
      )}

      <div className="composer">
        <textarea
          ref={area}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={disabled ? disabledNote || 'You cannot post right now.' : placeholder}
          aria-label={placeholder}
          onChange={event => {
            setValue(event.target.value)
            resize(event.target)
          }}
          onKeyDown={event => {
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
          <span>
            {disabled
              ? disabledNote || 'Muted by a moderator.'
              : 'Type / for commands · Enter to send'}
          </span>
        )}
        {slowmode > 0 && <span className="chip">slowmode {slowmode}s</span>}
      </div>
    </form>
  )
}
