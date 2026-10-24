import Avatar from './Avatar'
import Icon from './Icon'
import MessageList from './MessageList'
import Composer from './Composer'

/** "x is typing", "x and y are typing", or a summary once the room gets loud. */
function typingLabel(names) {
  if (!names.length) return ''
  if (names.length > 7) return 'more than 7 people are typing'
  if (names.length === 1) return `${names[0]} is typing`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are typing`
}

export default function ChatPane({
  me,
  channel,
  thread,
  messages,
  onSend,
  onOpenSidebar,
  onOpenMembers,
  onOpenSettings,
  replyTo,
  onReply,
  onCancelReply,
  onReact,
  onEditMessage,
  onDeleteMessage,
  onOpenRules,
  onOpenProfile,
  typing = [],
  onTyping,
}) {
  const kind = channel ? 'channel' : 'dm'
  const peer = thread?.peer
  const peerOnline = peer ? me.online.includes(peer.id) : false
  const muted = me.user.mutedUntil ? new Date(me.user.mutedUntil) > new Date() : false
  // Announcement rooms are readable by everyone and writable only by the Owner.
  const readOnly = Boolean(channel?.announce) && me.user.role !== 'owner'
  // No accepted rules, no chatting — the API refuses the post either way.
  const needsRules = !me.user.rulesAccepted
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

        <button
          type="button"
          className="chat-me"
          onClick={onOpenSettings}
          aria-label="My profile and settings"
          title="My profile and settings"
        >
          <Avatar
            name={me.user.displayName}
            color={me.user.color}
            size={28}
            online
            src={me.user.avatarUrl}
          />
        </button>

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
        onDeleteMessage={onDeleteMessage}
        onOpenProfile={onOpenProfile}
      />

      <div className="typing-line" aria-live="polite">
        {typingLabel(typing)}
      </div>

      {needsRules && (
        <div className="rules-banner">
          <span>rules not accepted — you can read every room, but not post.</span>
          <button type="button" className="text-btn" onClick={onOpenRules}>
            read the 10 rules
          </button>
        </div>
      )}

      <Composer
        placeholder={channel ? `Message #${channel.name}` : `Message ${title}`}
        commands={me.commands}
        onSend={onSend}
        onTyping={onTyping}
        replyTo={replyTo}
        onCancelReply={onCancelReply}
        disabled={muted || readOnly || needsRules}
        disabledNote={
          needsRules
            ? 'Accept the 10 rules before you can chat.'
            : readOnly
              ? 'Only the Owner posts in #announcements — you can read everything here.'
              : 'You are muted right now.'
        }
        slowmode={channel?.slowmode ?? 0}
      />
    </section>
  )
}
