import Avatar from './Avatar'

/**
 * The narrow-screen up-bar: rooms, DMs and the shortcuts on one line under the
 * top bar, so nothing has to live in a column beside the chat.
 */
export default function QuickBar({
  me,
  channelId,
  threadId,
  onPickChannel,
  onOpenDm,
  onOpenBoard,
  onOpenCasino,
  onOpenLeaders,
  onOpenFlairs,
  onOpenPass,
}) {
  const friends = me.friends
    .map(id => me.members.find(member => member.id === id))
    .filter(Boolean)
  const peers = me.threads
    .filter(thread => !me.friends.includes(thread.peer.id))
    .map(thread => ({ ...thread.peer, threadId: thread.id }))

  return (
    <nav className="quick-bar" aria-label="Rooms, messages and shortcuts">
      {me.channels.map(channel => (
        <button
          key={channel.id}
          type="button"
          className={`qb-item ${channel.id === channelId ? 'active' : ''}`}
          onClick={() => onPickChannel(channel)}
        >
          <span className="qb-mark">#</span>
          {channel.name}
        </button>
      ))}

      {friends.map(friend => {
        const thread = me.threads.find(item => item.peer.id === friend.id)
        return (
          <button
            key={friend.id}
            type="button"
            className={`qb-item qb-dm ${thread?.id === threadId ? 'active' : ''}`}
            onClick={() => onOpenDm(friend.id)}
          >
            <Avatar
              name={friend.displayName}
              color={friend.color}
              size={22}
              online={me.online.includes(friend.id)}
              src={friend.avatarUrl}
            />
            {friend.displayName}
          </button>
        )
      })}

      {peers.map(peer => (
        <button
          key={peer.id}
          type="button"
          className={`qb-item qb-dm ${peer.threadId === threadId ? 'active' : ''}`}
          onClick={() => onOpenDm(peer.id)}
        >
          <Avatar
            name={peer.displayName}
            color={peer.color}
            size={22}
            online={me.online.includes(peer.id)}
            src={peer.avatarUrl}
          />
          {peer.displayName}
        </button>
      ))}

      <button type="button" className="qb-item qb-coin" onClick={onOpenCasino}>
        <span className="qb-mark">◉</span>vault
      </button>
      <button type="button" className="qb-item" onClick={onOpenLeaders}>
        <span className="qb-mark">≡</span>ladder
      </button>
      <button type="button" className="qb-item" onClick={onOpenBoard}>
        <span className="qb-mark">●</span>online
      </button>
      <button type="button" className="qb-item" onClick={onOpenFlairs}>
        <span className="qb-mark">✦</span>flair
      </button>
      <button type="button" className="qb-item" onClick={onOpenPass}>
        <span className="qb-mark">▮</span>tier {me.user.pass?.tier ?? 0}
      </button>
    </nav>
  )
}
