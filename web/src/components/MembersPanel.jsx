import Avatar from './Avatar'
import Icon from './Icon'
import RoleBadge from './RoleBadge'

const GROUPS = [
  { role: 'owner', label: 'Owner' },
  { role: 'co-owner', label: 'Co-Owners' },
  { role: 'admin', label: 'Admins' },
  { role: 'mod', label: 'Mods' },
  { role: 'member', label: 'Members' },
]

export default function MembersPanel({ me, open, onClose, onOpenDm, onToggleFriend }) {
  const isOnline = id => me.online.includes(id)

  return (
    <>
      {open && <div className="scrim members-scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`members glass ${open ? 'open' : ''}`}>
        <div className="members-head">
          <div>
            <h2>Members</h2>
            <p>{me.members.length} people floating</p>
          </div>
          <button className="icon-btn members-close" onClick={onClose} aria-label="Close members">
            <Icon name="close" />
          </button>
        </div>

        <div className="members-list">
          {GROUPS.map(group => {
            const people = me.members.filter(member => member.role === group.role)
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
                        className="member-open"
                        onClick={() => onOpenDm(member.id)}
                        title={`Message ${member.displayName}`}
                      >
                        <Avatar
                          name={member.displayName}
                          color={member.color}
                          size={30}
                          online={isOnline(member.id)}
                        />
                        <span className="member-text">
                          <span className="member-name">{member.displayName}</span>
                          <span className="member-handle">@{member.username}</span>
                        </span>
                        <RoleBadge role={member.role} />
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
