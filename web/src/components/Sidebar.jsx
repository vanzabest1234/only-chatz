import { useState } from 'react'
import Avatar from './Avatar'
import Icon from './Icon'
import RoleBadge from './RoleBadge'
import PlayerName from './PlayerName'
import VoiceDock from './VoiceDock'
import { relativeTime, snippet, walletText } from '../lib/format'

export default function Sidebar({
  me,
  channelId,
  threadId,
  open,
  voice,
  onClose,
  onPickChannel,
  onOpenDm,
  onOpenMembers,
  onOpenSettings,
  onOpenBoard,
  onOpenFlairs,
  onOpenPass,
  onOpenCasino,
  onOpenLeaders,
  onSignOut,
  onCreateChannel,
  onRenameChannel,
}) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameName, setRenameName] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const voiceChannels = me.channels.filter(channel => channel.kind === 'voice')
  const voiceRoom = voice.channelId
    ? me.channels.find(channel => channel.id === voice.channelId)
    : null
  const voiceRooms = voice.rooms ?? {}

  const createVoice = async event => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFormError('')
    try {
      await onCreateChannel(newName)
      setCreating(false)
      setNewName('')
    } catch (problem) {
      setFormError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  const renameVoice = async (event, channel) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFormError('')
    try {
      await onRenameChannel(channel.id, renameName)
      setRenamingId(null)
      setRenameName('')
    } catch (problem) {
      setFormError(problem.message)
    } finally {
      setBusy(false)
    }
  }
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
                <PlayerName
                  className="nav-label"
                  name={friend.displayName}
                  role={friend.role}
                  flairs={friend.flairs}
                />
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
                  <PlayerName
                    className="nav-label"
                    name={thread.peer.displayName}
                    role={thread.peer.role}
                    flairs={thread.peer.flairs}
                  />
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

          <section className="section">
            <h2 className="section-title">Text Channels</h2>
            {me.channels
              .filter(channel => channel.kind !== 'voice')
              .map(channel => (
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
            <h2 className="section-title">Voice Channels</h2>
            {voiceChannels.length === 0 && (
              <p className="side-hint">No voice rooms yet — a voice room is where you talk.</p>
            )}
            {voiceChannels.map(channel => {
              const people = voiceRooms[channel.id] ?? []
              const joined = channel.id === voice.channelId
              return (
                <div key={channel.id} className="voice-row">
                  {renamingId === channel.id ? (
                    <form className="voice-form" onSubmit={event => renameVoice(event, channel)}>
                      <input
                        className="voice-input"
                        value={renameName}
                        onChange={event => setRenameName(event.target.value)}
                        aria-label={`Rename the ${channel.name} voice room`}
                        maxLength={24}
                        autoFocus
                      />
                      <button className="icon-btn" type="submit" aria-label="Save name" disabled={busy}>
                        <Icon name="check" size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        type="button"
                        aria-label="Cancel rename"
                        onClick={() => setRenamingId(null)}
                      >
                        <Icon name="close" size={15} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`nav-row voice-nav ${joined ? 'active' : ''}`}
                        onClick={() => (joined ? voice.leave() : voice.join(channel.id))}
                        aria-pressed={joined}
                        aria-label={`${joined ? 'Leave' : 'Join'} the ${channel.name} voice room`}
                      >
                        <Icon name="speaker" size={15} />
                        <span className="nav-label">{channel.name}</span>
                        {people.length > 0 && (
                          <span className="voice-avatars">
                            {people.slice(0, 4).map(person => (
                              <span
                                key={person.userId}
                                className={
                                  voice.speaking.includes(person.userId) ? 'voice-avatar is-speaking' : 'voice-avatar'
                                }
                              >
                                <Avatar
                                  name={person.displayName}
                                  color={person.color}
                                  src={person.avatarUrl}
                                  size={18}
                                />
                              </span>
                            ))}
                            {people.length > 4 && (
                              <span className="voice-more">+{people.length - 4}</span>
                            )}
                          </span>
                        )}
                      </button>
                      {me.canManageChannels && (
                        <button
                          type="button"
                          className="icon-btn voice-edit"
                          aria-label={`Rename the ${channel.name} voice room`}
                          title="rename"
                          onClick={() => {
                            setFormError('')
                            setRenamingId(channel.id)
                            setRenameName(channel.name)
                          }}
                        >
                          <Icon name="pencil" size={13} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}

            {(formError || voice.error) && (
              <p className="voice-error">{formError || voice.error}</p>
            )}

            {me.canManageChannels &&
              (creating ? (
                <form className="voice-form voice-create" onSubmit={createVoice}>
                  <input
                    className="voice-input"
                    value={newName}
                    onChange={event => setNewName(event.target.value)}
                    placeholder="new-voice-room"
                    aria-label="New voice room name"
                    maxLength={24}
                    autoFocus
                  />
                  <button className="icon-btn" type="submit" aria-label="Create voice room" disabled={busy}>
                    <Icon name="check" size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label="Cancel new voice room"
                    onClick={() => {
                      setCreating(false)
                      setNewName('')
                      setFormError('')
                    }}
                  >
                    <Icon name="close" size={15} />
                  </button>
                </form>
              ) : (
                <button
                  className="nav-row ghost"
                  type="button"
                  onClick={() => {
                    setFormError('')
                    setCreating(true)
                  }}
                >
                  <Icon name="plus" size={15} />
                  <span className="nav-label">New voice room</span>
                </button>
              ))}
          </section>

          <section className="section">
            <button className="nav-row coin-link" onClick={onOpenCasino}>
              <span className="hash">◉</span>
              <span className="nav-label">Royal vault</span>
              <span className="chip">
                {walletText(me.user.coins)}
              </span>
            </button>
            <button className="nav-row ladder-link" onClick={onOpenLeaders}>
              <span className="hash">≡</span>
              <span className="nav-label">Coin leaderboard</span>
              <span className="chip">top 10</span>
            </button>
            <button className="nav-row board-link" onClick={onOpenBoard}>
              <span className="live-dot" />
              <span className="nav-label">Who&apos;s online</span>
              <span className="chip">{me.online.length}</span>
            </button>
            <button className="nav-row flair-link" onClick={onOpenFlairs}>
              <span className="hash">✦</span>
              <span className="nav-label">Daily wheel</span>
              <span className="chip">1/day</span>
            </button>
            <button className="nav-row pass-link" onClick={onOpenPass}>
              <span className="hash">▮</span>
              <span className="nav-label">Season pass</span>
              <span className="chip">tier {me.user.pass?.tier ?? 0}</span>
            </button>
          </section>
        </div>

        {voiceRoom && (
          <VoiceDock
            channel={voiceRoom}
            roster={voice.roster}
            speaking={voice.speaking}
            muted={voice.muted}
            deafened={voice.deafened}
            hasMic={voice.hasMic}
            micError={voice.micError}
            error={voice.error}
            meId={me.user.id}
            onToggleMute={voice.toggleMute}
            onToggleDeafen={voice.toggleDeafen}
            onLeave={voice.leave}
          />
        )}

        <div className="me-card">
          <Avatar
            name={me.user.displayName}
            color={me.user.color}
            size={34}
            online
            src={me.user.avatarUrl}
          />
          <div className="meta">
            <PlayerName
              className="name"
              name={me.user.displayName}
              role={me.user.role}
              flairs={me.user.flairs}
            />
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
