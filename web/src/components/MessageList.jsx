import { useEffect, useRef, useState } from 'react'
import Avatar from './Avatar'
import RoleBadge from './RoleBadge'
import FlairBadges from './FlairBadges'
import { snippet, timeShort } from '../lib/format'
import { splitMentions } from '../lib/mentions'

/** Message text with every "@name" picked out, and your own name lit up. */
function MessageText({ content, username, className = 'msg-text' }) {
  return (
    <p className={className}>
      {splitMentions(content, username).map((part, index) =>
        part.mention ? (
          <mark key={index} className={`msg-mention ${part.mine ? 'is-me' : ''}`}>
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  )
}

/** Avatars pick up the season-pass frame its owner reached (nothing at tier 0). */
function FramedAvatar({ frame, children }) {
  if (!frame) return children
  return <span className={`avatar-frame frame-${frame}`}>{children}</span>
}

const REACTIONS = ['👍', '❤️', '😂', '🔥', '👀', '🎉']

function ReplyQuote({ replyTo }) {
  if (!replyTo) return null
  return (
    <span className="reply-quote">
      <span className="reply-arrow">↰</span>
      <span className="reply-who">{replyTo.authorName}</span>
      <span className="reply-text">{snippet(replyTo.content, 90)}</span>
    </span>
  )
}

function ReactionBar({ message, me, onReact }) {
  if (!message.reactions?.length) return null
  return (
    <div className="reactions">
      {message.reactions.map(group => (
        <button
          key={group.emoji}
          type="button"
          className={`reaction ${group.userIds.includes(me.user.id) ? 'mine' : ''}`}
          onClick={() => onReact(message.id, group.emoji)}
          title={`${group.userIds.length} reacted`}
        >
          <span>{group.emoji}</span>
          <span className="reaction-count">{group.userIds.length}</span>
        </button>
      ))}
    </div>
  )
}

/** Hover (or tap) actions: react, reply, edit your own message, and delete where allowed. */
function MessageTools({ message, own, canDelete, onReact, onReply, onEdit, onDelete }) {
  const [picking, setPicking] = useState(false)

  return (
    <div className={`msg-tools ${picking ? 'open' : ''}`}>
      <button
        type="button"
        className="msg-tool"
        aria-label="Add a reaction"
        onClick={() => setPicking(value => !value)}
      >
        ☺
      </button>
      <button type="button" className="msg-tool" aria-label="Reply" onClick={() => onReply(message)}>
        ↰
      </button>
      {own && (
        <button type="button" className="msg-tool" aria-label="Edit message" onClick={onEdit}>
          ✎
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          className="msg-tool msg-tool-del"
          aria-label="Delete message"
          onClick={onDelete}
        >
          ✕
        </button>
      )}
      {picking && (
        <div className="reaction-picker">
          {REACTIONS.map(emoji => (
            <button
              key={emoji}
              type="button"
              aria-label={`React with ${emoji}`}
              onClick={() => {
                onReact(message.id, emoji)
                setPicking(false)
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

function EditBox({ text, busy, onSave, onCancel }) {
  const [value, setValue] = useState(text)

  return (
    <div className="msg-edit">
      <textarea
        value={value}
        rows={2}
        autoFocus
        aria-label="Edit message"
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') onCancel()
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            onSave(value)
          }
        }}
      />
      <div className="msg-edit-actions">
        <button type="button" onClick={() => onSave(value)} disabled={busy}>
          save
        </button>
        <button type="button" onClick={onCancel}>
          cancel
        </button>
      </div>
    </div>
  )
}

/** The author's picture opens their profile banner; a deleted author has no profile. */
function ProfileAvatar({ message, size, onOpenProfile }) {
  const avatar = (
    <Avatar
      name={message.authorName}
      color={message.authorColor}
      size={size}
      src={message.authorAvatar}
    />
  )
  if (!message.authorId) return avatar
  return (
    <button
      type="button"
      className="avatar-btn"
      onClick={() => onOpenProfile(message.authorId)}
      aria-label={`View ${message.authorName}'s profile`}
      title="View profile"
    >
      {avatar}
    </button>
  )
}

function ChannelMessage({ message, me, onReact, onReply, onEdit, onDelete, onOpenProfile }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  if (message.system) {
    return (
      <div className="msg system">
        <span className="system-line">{message.content}</span>
      </div>
    )
  }

  const own = message.authorId === me.user.id
  const canDelete = own || me.user.role === 'owner'

  async function save(text) {
    if (!text.trim()) return
    setBusy(true)
    try {
      await onEdit(message.id, text.trim())
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="msg">
      <FramedAvatar frame={message.authorFrame}>
        <ProfileAvatar message={message} size={38} onOpenProfile={onOpenProfile} />
      </FramedAvatar>
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-name">{message.authorName}</span>
          <RoleBadge role={message.authorRole} />
          <FlairBadges flairs={message.authorFlairs} customTag={message.authorCustomTag} />
          <span className="msg-time">{timeShort(message.createdAt)}</span>
          {message.editedAt && <span className="msg-edited">(edited)</span>}
        </div>
        <ReplyQuote replyTo={message.replyTo} />
        {editing ? (
          <EditBox
            text={message.content}
            busy={busy}
            onSave={save}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <MessageText content={message.content} username={me.user.username} />
        )}
        <ReactionBar message={message} me={me} onReact={onReact} />
      </div>
      {!editing && (
        <MessageTools
          message={message}
          own={own}
          canDelete={canDelete}
          onReact={onReact}
          onReply={onReply}
          onEdit={() => setEditing(true)}
          onDelete={() => onDelete(message)}
        />
      )}
    </div>
  )
}

function DmMessage({ message, me, onReact, onReply, onEdit, onDelete, onOpenProfile }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const own = message.authorId === me.user.id
  const canDelete = own || me.user.role === 'owner'

  async function save(text) {
    if (!text.trim()) return
    setBusy(true)
    try {
      await onEdit(message.id, text.trim())
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`msg dm ${own ? 'own' : ''}`}>
      {!own && <ProfileAvatar message={message} size={32} onOpenProfile={onOpenProfile} />}
      <div className="dm-stack">
        {!own && (
          <div className="msg-head">
            <span className="msg-name">{message.authorName}</span>
            <RoleBadge role={message.authorRole} />
            <span className="msg-time">{timeShort(message.createdAt)}</span>
            {message.editedAt && <span className="msg-edited">(edited)</span>}
          </div>
        )}
        <ReplyQuote replyTo={message.replyTo} />
        {editing ? (
          <EditBox
            text={message.content}
            busy={busy}
            onSave={save}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <MessageText content={message.content} username={me.user.username} className="bubble" />
        )}
        <ReactionBar message={message} me={me} onReact={onReact} />
        {own && (
          <span className="msg-time dm-time-own">
            {message.editedAt ? `${timeShort(message.createdAt)} · edited` : timeShort(message.createdAt)}
          </span>
        )}
      </div>
      {!editing && (
        <MessageTools
          message={message}
          own={own}
          canDelete={canDelete}
          onReact={onReact}
          onReply={onReply}
          onEdit={() => setEditing(true)}
          onDelete={() => onDelete(message)}
        />
      )}
    </div>
  )
}

export default function MessageList({
  messages,
  kind,
  me,
  onReact,
  onReply,
  onEditMessage,
  onDeleteMessage,
  onOpenProfile,
}) {
  const scroller = useRef(null)

  useEffect(() => {
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages.length, kind])

  if (!messages.length) {
    return (
      <div className="messages">
        <p className="empty">
          {kind === 'dm'
            ? 'This is the start of your conversation. Say something nice.'
            : 'Nothing here yet — be the first to say something.'}
        </p>
      </div>
    )
  }

  return (
    <div className={`messages ${kind === 'dm' ? 'dm-list' : ''}`} ref={scroller}>
      {messages.map(message =>
        kind === 'dm' ? (
          <DmMessage
            key={message.id}
            message={message}
            me={me}
            onReact={onReact}
            onReply={onReply}
            onEdit={onEditMessage}
            onDelete={onDeleteMessage}
            onOpenProfile={onOpenProfile}
          />
        ) : (
          <ChannelMessage
            key={message.id}
            message={message}
            me={me}
            onReact={onReact}
            onReply={onReply}
            onEdit={onEditMessage}
            onDelete={onDeleteMessage}
            onOpenProfile={onOpenProfile}
          />
        ),
      )}
    </div>
  )
}
