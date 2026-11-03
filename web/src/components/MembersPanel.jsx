import { useState } from 'react'
import Avatar from './Avatar'
import Icon from './Icon'
import RoleBadge from './RoleBadge'

const TABS = [
  { id: 'people', label: 'People', icon: 'users' },
  { id: 'online', label: 'Online', icon: 'pulse' },
  { id: 'friends', label: 'Friends', icon: 'heart' },
]

export default function MembersPanel({ me, open, onClose, onOpenDm, onToggleFriend }) {
  const [tab, setTab] = useState('people')
  const isOnline = id => me.online.includes(id)

  const people = me.members.filter(member => {
    if (tab === 'online') return isOnline(member.id)
    if (tab === 'friends') return me.friends.includes(member.id)
    return true
  })

  const label = TABS.find(item => item.id === tab).label

  return (
    <>
      {open && <div className="scrim members-scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`members glass ${open ? 'open' : ''}`}>
        <div className="members-tabs" role="tablist" aria-label="People filters">
          {TABS.map(item => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              aria-label={item.label}
              title={item.label}
              className={`members-tab ${tab === item.id ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <Icon name={item.icon} size={17} />
            </button>
          ))}
        </div>

        <div className="members-head">
          <h2>{label}</h2>
          <span className="members-count">{people.length}</span>
          <button className="icon-btn members-close" onClick={onClose} aria-label="Close members">
            <Icon name="close" />
          </button>
        </div>

        <div className="members-list">
          {people.length === 0 && <p className="side-hint">Nobody here yet.</p>}
          {people.map(member => {
            const friend = me.friends.includes(member.id)
            return (
              <div className={`member-row ${member.id === me.user.id ? 'me' : ''}`} key={member.id}>
                <button
                  className="member-open"
                  onClick={() => onOpenDm(member.id)}
                  title={`Message ${member.displayName}`}
                >
                  <Avatar
                    name={member.displayName}
                    color={member.color}
                    size={34}
                    online={isOnline(member.id)}
                    src={member.avatarUrl}
                  />
                  <span className="member-text">
                    <span className="member-name">
                      {member.displayName}
                      <RoleBadge role={member.role} />
                    </span>
                    <span className="member-handle">@{member.username}</span>
                  </span>
                </button>
                {member.id !== me.user.id && (
                  <button
                    className={`friend-btn ${friend ? 'is-friend' : ''}`}
                    onClick={() => onToggleFriend(member.id)}
                    aria-label={friend ? 'Remove friend' : 'Add friend'}
                    title={friend ? 'Remove friend' : 'Add friend'}
                  >
                    <Icon name="heart" size={15} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </aside>
    </>
  )
}
