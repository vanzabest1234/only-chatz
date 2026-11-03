import Avatar from './Avatar'
import Icon from './Icon'
import RoleBadge from './RoleBadge'
import { roleLabel } from '../lib/roles'

const ORDER = ['owner', 'co-owner', 'admin', 'mod', 'member']

export default function OnlineBoard({ me, where, onClose, onOpenDm }) {
  const roomLabel = entry => {
    if (!entry) return 'Floating around'
    if (entry.kind === 'channel') {
      const channel = me.channels.find(item => item.id === entry.id)
      return channel ? `#${channel.name}` : 'A channel'
    }
    const thread = me.threads.find(item => item.id === entry.id)
    return thread ? `DM with ${thread.peer.displayName}` : 'A direct message'
  }

  const people = me.members
    .filter(member => me.online.includes(member.id))
    .sort(
      (a, b) =>
        ORDER.indexOf(a.role) - ORDER.indexOf(b.role) ||
        a.displayName.localeCompare(b.displayName),
    )

  // Same rank order as the people rail: owner → co-owner → admin → mod → members.
  const groups = ORDER.map(role => ({
    role,
    label: role === 'member' ? 'Members' : roleLabel(role),
    people: people.filter(person => person.role === role),
  })).filter(group => group.people.length > 0)

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="board glass"
        role="dialog"
        aria-modal="true"
        aria-label="Who's online"
        onClick={event => event.stopPropagation()}
      >
        <header className="board-head">
          <div>
            <h2>Who&apos;s online now</h2>
            <p>
              {people.length} of {me.members.length} here right now
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close board">
            <Icon name="close" />
          </button>
        </header>

        <div className="board-list">
          {people.length === 0 && <p className="board-empty">Nobody else is floating here yet.</p>}
          {groups.map(group => (
            <section className="member-group" key={group.role}>
              <h3 className="member-group-head">
                {group.label}
                <span className="member-group-count">{group.people.length}</span>
              </h3>
              {group.people.map(person => (
                <button
                  key={person.id}
                  className="board-row"
                  onClick={() => {
                    if (person.id === me.user.id) return
                    onClose()
                    onOpenDm(person.id)
                  }}
                  title={person.id === me.user.id ? 'That is you' : `Message ${person.displayName}`}
                >
                  <Avatar
                    name={person.displayName}
                    color={person.color}
                    size={34}
                    online
                    src={person.avatarUrl}
                  />
                  <span className="board-text">
                    <span className="board-name">
                      {person.displayName}
                      {person.id === me.user.id ? ' (you)' : ''}
                    </span>
                    <span className="board-room">{roomLabel(where[person.id])}</span>
                  </span>
                  <RoleBadge role={person.role} />
                </button>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
