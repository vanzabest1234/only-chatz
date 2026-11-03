import Icon from './Icon'

export default function AppFooter({ onlineCount, onToggleChannels }) {
  return (
    <footer className="bottombar">
      <span className="bottombar-status">
        <span className="play-mark">
          <Icon name="play" size={11} />
        </span>
        live · {onlineCount} online
      </span>
      <button
        className="icon-btn"
        onClick={onToggleChannels}
        aria-label="Channels"
        title="Channels"
      >
        <Icon name="menu" />
      </button>
    </footer>
  )
}
