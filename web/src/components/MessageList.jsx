import { useEffect, useRef } from 'react'
import Avatar from './Avatar'
import RoleBadge from './RoleBadge'
import { timeShort } from '../lib/format'

function ChannelMessage({ message }) {
  if (message.system) {
    return (
      <div className="msg system">
        <span className="system-line">{message.content}</span>
      </div>
    )
  }
  return (
    <div className="msg">
      <Avatar name={message.authorName} color={message.authorColor} />
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-name">{message.authorName}</span>
          <RoleBadge role={message.authorRole} />
          <span className="msg-time">{timeShort(message.createdAt)}</span>
        </div>
        <p className="msg-text">{message.content}</p>
      </div>
    </div>
  )
}

function DmMessage({ message, me }) {
  const own = message.authorId === me.user.id
  return (
    <div className={`msg dm ${own ? 'own' : ''}`}>
      {!own && <Avatar name={message.authorName} color={message.authorColor} size={32} />}
      <div className="dm-stack">
        {!own && (
          <div className="msg-head">
            <span className="msg-name">{message.authorName}</span>
            <RoleBadge role={message.authorRole} />
            <span className="msg-time">{timeShort(message.createdAt)}</span>
          </div>
        )}
        <div className="bubble">{message.content}</div>
        {own && <span className="msg-time dm-time-own">{timeShort(message.createdAt)}</span>}
      </div>
    </div>
  )
}

export default function MessageList({ messages, kind, me }) {
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
          <DmMessage key={message.id} message={message} me={me} />
        ) : (
          <ChannelMessage key={message.id} message={message} />
        ),
      )}
    </div>
  )
}
