import Avatar from './Avatar'
import Icon from './Icon'
import RoleBadge from './RoleBadge'
import { relativeTime, snippet } from '../lib/format'

export default function Sidebar({
  me,
  channelId,
  threadId,
  open,
  onClose,
  onPickChannel,
  onOpenDm,
  onOpenMembers,
  onOpenSettings,
  onOpenBoard,
  onOpenFlairs,
  onOpenPass,
  onOpenCasino,
  onSignOut,
}) {
  const friendUsers = me.friends
    .map(id => me.members.find(member => member.id === id))
    .filter(Boolean)
  const otherThreads = me.threads.filter(thread => !me.friends.includes(thread.peer.id))
  const isOnline = id => me.online.includes(id)

  return (
    <>
      {open && <div className="scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`sidebar glass ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-glyph">◍</div>
          <div className="brand-text">
            <h1>Only Chatz</h1>
            <p>{me.members.length} floating people</p>
          </div>
          <button className="icon-btn drawer-close" onClick={onClose} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>

        <div className="sidebar-scroll">
          <section className="section">
            <button className="nav-row coin-link" onClick={onOpenCasino}>
              <span className="hash">◉</span>
              <span className="nav-label">Royal vault</span>
              <span className="chip">
                {Number(me.user.coins?.coins ?? 0).toLocaleString('en-US')}
              </span>
            </button>
            <button className="nav-row board-link" onClick={onOpenBoard}>
              <span className="live-dot" />
              <span className="nav-label">Who&apos;s online</span>
              <span className="chip">{me.online.length}</span>
            </button>
            <button className="nav-row flair-link" onClick={onOpenFlairs}>
              <span className="hash">✦</span>
              <span className="nav-label">Flair wheel</span>
              <span className="chip">spin</span>
            </button>
            <button className="nav-row pass-link" onClick={onOpenPass}>
              <span className="hash">▮</span>
              <span className="nav-label">Season pass</span>
              <span className="chip">tier {me.user.pass?.tier ?? 0}</span>
            </button>
          </section>

          <section className="section">
            <h2 className="section-title">Text Channels</h2>
            {me.channels.map(channel => (
              <button
                key={channel.id}
                className={`nav-row ${channel.id === channelId ? 'active' : ''}`}
                onClick={() => onPickChannel(channel)}
              >
                <span className="hash">#</span>
                <span className="nav-label">{channel.name}</span>
                {channel.slowmode > 0 && <span className="chip">{channel.slowmode}s</span>}
              </button>
            ))}
          </section>

          <section className="section">
            <h2 className="section-title">Direct Messages</h2>

            <h3 className="sub-title">Friends</h3>
            {friendUsers.length === 0 && (
              <p className="side-hint">Add someone from the member list to keep them close.</p>
            )}
            {friendUsers.map(friend => (
              <button
                key={friend.id}
                className={`nav-row dm-row ${me.threads.find(t => t.peer.id === friend.id)?.id === threadId ? 'active' : ''}`}
                onClick={() => onOpenDm(friend.id)}
              >
                <Avatar
                  name={friend.displayName}
                  color={friend.color}
                  size={28}
                  online={isOnline(friend.id)}
                  src={friend.avatarUrl}
                />
                <span className="nav-label">{friend.displayName}</span>
                <RoleBadge role={friend.role} />
              </button>
            ))}

            {otherThreads.length > 0 && <h3 className="sub-title">Conversations</h3>}
            {otherThreads.map(thread => (
              <button
                key={thread.id}
                className={`nav-row dm-row ${thread.id === threadId ? 'active' : ''}`}
                onClick={() => onOpenDm(thread.peer.id)}
              >
                <Avatar
                  name={thread.peer.displayName}
                  color={thread.peer.color}
                  size={28}
                  online={isOnline(thread.peer.id)}
                  src={thread.peer.avatarUrl}
                />
                <span className="dm-text">
                  <span className="nav-label">{thread.peer.displayName}</span>
                  <span className="dm-snippet">
                    {thread.lastMessage ? snippet(thread.lastMessage.content) : 'Say hello'}
                  </span>
                </span>
                <span className="dm-time">{relativeTime(thread.lastMessage?.createdAt)}</span>
              </button>
            ))}

            <button className="nav-row ghost" onClick={onOpenMembers}>
              <Icon name="plus" size={16} />
              <span className="nav-label">Start a conversation</span>
            </button>
          </section>
        </div>

        <div className="me-card">
          <Avatar
            name={me.user.displayName}
            color={me.user.color}
            size={34}
            online
            src={me.user.avatarUrl}
          />
          <div className="meta">
            <span className="name">{me.user.displayName}</span>
            <RoleBadge role={me.user.role} />
          </div>
          <button
            className="icon-btn"
            onClick={onOpenSettings}
            aria-label="Profile settings"
            title="Profile settings"
          >
            <Icon name="profile" />
          </button>
          <button className="icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
            <Icon name="logout" />
          </button>
        </div>
      </aside>
    </>
  )
}
