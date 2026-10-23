import Avatar from './Avatar'
import Icon from './Icon'
import RoleBadge from './RoleBadge'
import FlairBadges from './FlairBadges'

const GROUPS = [
  { role: 'owner', label: 'Owner' },
  { role: 'co-owner', label: 'Co-Owners' },
  { role: 'admin', label: 'Admins' },
  { role: 'mod', label: 'Mods' },
  { role: 'member', label: 'Members' },
]

export default function MembersPanel({ me, open, onClose, onOpenDm, onToggleFriend, onOpenProfile }) {
  const isOnline = id => me.online.includes(id)
  // Presence only: offline accounts stay out, and the groups keep GROUPS order so the
  // Owner always sits at the top.
  const online = me.members.filter(member => isOnline(member.id))

  return (
    <>
      {open && <div className="scrim members-scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`members glass ${open ? 'open' : ''}`}>
        <div className="members-head">
          <div>
            <h2>Who&apos;s online</h2>
            <p>{online.length} floating right now</p>
          </div>
          <button className="icon-btn members-close" onClick={onClose} aria-label="Close members">
            <Icon name="close" />
          </button>
        </div>

        <div className="members-list">
          {!online.length && <p className="side-hint members-empty">nobody is floating right now.</p>}
          {GROUPS.map(group => {
            const people = online.filter(member => member.role === group.role)
            if (!people.length) return null
            return (
              <div className="member-group" key={group.role}>
                <h3 className="section-title">
                  {group.label} — {people.length}
                </h3>
                {people.map(member => {
                  const friend = me.friends.includes(member.id)
                  return (
                    <div className="member-row" key={member.id}>
                      <button
                        type="button"
                        className="member-avatar"
                        onClick={() => onOpenProfile(member.id)}
                        aria-label={`View ${member.displayName}'s profile`}
                        title="View profile"
                      >
                        <Avatar
                          name={member.displayName}
                          color={member.color}
                          size={30}
                          online={isOnline(member.id)}
                          src={member.avatarUrl}
                        />
                      </button>
                      <button
                        className="member-open"
                        onClick={() => onOpenDm(member.id)}
                        title={`Message ${member.displayName}`}
                      >
                        <span className="member-text">
                          <span className="member-name">{member.displayName}</span>
                          <span className="member-handle">@{member.username}</span>
                        </span>
                        <span className="member-tags">
                          <RoleBadge role={member.role} />
                          <FlairBadges
                            flairs={member.flairs}
                            customTag={member.customTag}
                            compact
                          />
                        </span>
                      </button>
                      {member.id !== me.user.id && (
                        <button
                          className={`friend-btn ${friend ? 'is-friend' : ''}`}
                          onClick={() => onToggleFriend(member.id)}
                          aria-label={friend ? 'Remove friend' : 'Add friend'}
                          title={friend ? 'Remove friend' : 'Add friend'}
                        >
                          <Icon name={friend ? 'check' : 'plus'} size={14} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </aside>
    </>
  )
}
