import Avatar from './Avatar'
import Icon from './Icon'
import RoleBadge from './RoleBadge'
import FlairBadges from './FlairBadges'

/** The banner that opens when someone taps another member's picture. */
export default function ProfileCard({ member, online, isSelf, onClose, onOpenDm }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="profile-card glass"
        role="dialog"
        aria-modal="true"
        aria-label={`${member.displayName}'s profile`}
        onClick={event => event.stopPropagation()}
      >
        <div className="profile-top">
          <Avatar
            name={member.displayName}
            color={member.color}
            size={64}
            online={online}
            src={member.avatarUrl}
          />
          <div className="profile-id">
            <h2>{member.displayName}</h2>
            <p className="profile-handle">@{member.username}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close profile">
            <Icon name="close" />
          </button>
        </div>

        <div className="profile-tags">
          <RoleBadge role={member.role} />
          <FlairBadges flairs={member.flairs} />
          {member.pronouns && <span className="profile-pronouns">{member.pronouns}</span>}
          <span className={`profile-status ${online ? 'is-on' : ''}`}>
            {online ? 'online' : 'offline'}
          </span>
        </div>

        <p className={`profile-bio ${member.bio ? '' : 'is-empty'}`}>
          {member.bio || 'no bio yet.'}
        </p>

        {!isSelf && onOpenDm && (
          <button
            type="button"
            className="btn-primary profile-dm"
            onClick={() => {
              onClose()
              onOpenDm(member.id)
            }}
          >
            message
          </button>
        )}
      </div>
    </div>
  )
}
