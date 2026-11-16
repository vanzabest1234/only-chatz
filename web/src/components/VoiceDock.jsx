import Avatar from './Avatar'
import Icon from './Icon'

/**
 * The connected panel: who is in the room, who is talking, and the three controls.
 * It sits at the foot of the rooms sheet, above the me-card, like the call bar in a
 * desktop chat client — the rooms panel is a drop-down here, so nothing floats over
 * the conversation.
 */
export default function VoiceDock({
  channel,
  roster,
  speaking,
  muted,
  deafened,
  hasMic,
  micError,
  error,
  meId,
  onToggleMute,
  onToggleDeafen,
  onLeave,
}) {
  const isSpeaking = userId => speaking.includes(userId)

  return (
    <section className="voice-dock" aria-label={`Voice connected to ${channel.name}`}>
      <header className="voice-dock-head">
        <span className="voice-dock-ping" aria-hidden="true" />
        <span className="voice-dock-text">
          <span className="voice-dock-title">voice connected</span>
          <span className="voice-dock-name">{channel.name}</span>
        </span>
        <span className="voice-dock-count">{roster.length}</span>
      </header>

      <div className="voice-tiles">
        {roster.map(person => (
          <div
            key={person.userId}
            className={`voice-tile ${isSpeaking(person.userId) ? 'is-speaking' : ''} ${
              person.userId === meId ? 'is-me' : ''
            }`}
            title={person.displayName}
          >
            <Avatar
              name={person.displayName}
              color={person.color}
              src={person.avatarUrl}
              size={32}
            />
            <span className="voice-tile-name">{person.displayName}</span>
            <span className="voice-tile-flags">
              {person.muted && <Icon name="micOff" size={11} />}
              {person.deafened && <Icon name="headphonesOff" size={11} />}
            </span>
          </div>
        ))}
      </div>

      {(error || micError) && <p className="voice-note">{error || micError}</p>}

      <div className="voice-controls">
        <button
          type="button"
          className={`voice-btn ${muted ? 'is-off' : ''}`}
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
          title={hasMic ? (muted ? 'unmute' : 'mute') : 'no microphone'}
        >
          <Icon name={muted ? 'micOff' : 'mic'} size={15} />
          <span>{muted ? 'muted' : 'mic'}</span>
        </button>
        <button
          type="button"
          className={`voice-btn ${deafened ? 'is-off' : ''}`}
          onClick={onToggleDeafen}
          aria-pressed={deafened}
          aria-label={deafened ? 'Undeafen' : 'Deafen'}
          title={deafened ? 'undeafen' : 'deafen'}
        >
          <Icon name={deafened ? 'headphonesOff' : 'headphones'} size={15} />
          <span>{deafened ? 'deafened' : 'sound'}</span>
        </button>
        <button type="button" className="voice-btn voice-leave" onClick={onLeave} aria-label="Leave voice">
          <Icon name="logout" size={15} />
          <span>leave</span>
        </button>
      </div>
    </section>
  )
}
