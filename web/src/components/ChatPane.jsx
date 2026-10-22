import Avatar from './Avatar'
import Icon from './Icon'
import MessageList from './MessageList'
import Composer from './Composer'

export default function ChatPane({
  me,
  channel,
  thread,
  messages,
  onSend,
  onOpenSidebar,
  onOpenMembers,
  replyTo,
  onReply,
  onCancelReply,
  onReact,
  onEditMessage,
}) {
  const kind = channel ? 'channel' : 'dm'
  const peer = thread?.peer
  const peerOnline = peer ? me.online.includes(peer.id) : false
  const muted = me.user.mutedUntil ? new Date(me.user.mutedUntil) > new Date() : false
  // Announcement rooms are readable by everyone and writable only by the Owner.
  const readOnly = Boolean(channel?.announce) && me.user.role !== 'owner'
  const title = channel ? channel.name : peer?.displayName ?? 'Conversation'
  const subtitle = channel
    ? channel.topic || 'No topic yet'
    : peerOnline
      ? 'Online now'
      : 'Away'

  return (
    <section className="chat glass">
      <header className="chat-header">
        <button className="icon-btn hamburger" onClick={onOpenSidebar} aria-label="Open channels">
          <Icon name="menu" />
        </button>

        <div className="chat-title">
          {channel ? (
            <span className="hash-big">#</span>
          ) : (
            peer && (
              <Avatar
                name={peer.displayName}
                color={peer.color}
                size={32}
                online={peerOnline}
                src={peer.avatarUrl}
              />
            )
          )}
          <div className="chat-title-text">
            <h2>{title}</h2>
            <p className="chat-topic">{subtitle}</p>
          </div>
        </div>

        <button className="icon-btn members-toggle" onClick={onOpenMembers} aria-label="Open members">
          <Icon name="users" />
          <span className="members-count">{me.members.length}</span>
        </button>
      </header>

      <MessageList
        messages={messages}
        kind={kind}
        me={me}
        onReact={onReact}
        onReply={onReply}
        onEditMessage={onEditMessage}
      />

      <Composer
        placeholder={channel ? `Message #${channel.name}` : `Message ${title}`}
        commands={me.commands}
        onSend={onSend}
        replyTo={replyTo}
        onCancelReply={onCancelReply}
        disabled={muted || readOnly}
        disabledNote={
          readOnly
            ? 'Only the Owner posts in #announcements — you can read everything here.'
            : 'You are muted right now.'
        }
        slowmode={channel?.slowmode ?? 0}
      />
    </section>
  )
}
