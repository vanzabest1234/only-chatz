import { useEffect, useRef } from 'react'
import Avatar from './Avatar'
import Icon from './Icon'
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
      <Avatar name={message.authorName} color={message.authorColor} src={message.authorAvatar} />
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
      {!own && (
        <Avatar
          name={message.authorName}
          color={message.authorColor}
          size={32}
          src={message.authorAvatar}
        />
      )}
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

function EmptyRoom({ kind, channelName }) {
  if (kind === 'dm') {
    return (
      <div className="empty-room">
        <div className="empty-badge">
          <Icon name="book" size={24} />
        </div>
        <h3>Your study corner</h3>
        <p>This is the start of your conversation. Say hello, swap notes, or plan a study session.</p>
      </div>
    )
  }

  return (
    <div className="empty-room">
      <div className="empty-badge">
        <Icon name="book" size={24} />
      </div>
      <h3>Welcome to {channelName ? `#${channelName}` : 'the study room'}</h3>
      <p>
        Class is quiet for now. Take a seat, get your notes out, and start the conversation — no
        question is too small.
      </p>
      <ul className="empty-tips">
        <li>
          <Icon name="pencil" size={15} /> Share what you are studying
        </li>
        <li>
          <Icon name="check" size={15} /> Post notes or ask a question
        </li>
        <li>
          <Icon name="users" size={15} /> Invite a classmate to join
        </li>
      </ul>
    </div>
  )
}

export default function MessageList({ messages, kind, me, channelName }) {
  const scroller = useRef(null)

  useEffect(() => {
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages.length, kind])

  if (!messages.length) {
    return (
      <div className="messages">
        <EmptyRoom kind={kind} channelName={channelName} />
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
