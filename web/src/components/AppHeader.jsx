import Avatar from './Avatar'
import Icon from './Icon'

export default function AppHeader({ user, onlineCount, onTogglePeople, onOpenBoard, onOpenSettings }) {
  return (
    <header className="topbar">
      <div className="logo">
        <span className="logo-mark">◍</span>
        <span className="logo-text">Only Chatz</span>
      </div>

      <div className="topbar-actions">
        <span className="topbar-live">
          <span className="live-dot" />
          {onlineCount} online
        </span>
        <button
          className="icon-btn"
          onClick={onTogglePeople}
          aria-label="People"
          title="People"
        >
          <Icon name="users" />
        </button>
        <button
          className="icon-btn"
          onClick={onOpenBoard}
          aria-label="Who's online"
          title="Who's online"
        >
          <Icon name="bell" />
        </button>
        <button className="avatar-btn" onClick={onOpenSettings} aria-label="Profile settings">
          <Avatar
            name={user.displayName}
            color={user.color}
            size={34}
            online
            src={user.avatarUrl}
          />
        </button>
      </div>
    </header>
  )
}
