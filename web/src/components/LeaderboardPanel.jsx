import { useEffect, useState } from 'react'
import Avatar from './Avatar'
import Icon from './Icon'
import RoleBadge from './RoleBadge'
import { api } from '../api'
import { money } from '../lib/format'


/**
 * The coin ladder: the ten richest purses, counted by the server. The same rows answer
 * `/leaderboard` in chat, so the panel and the command never disagree.
 */
export default function LeaderboardPanel({ me, onClose }) {
  const [leaders, setLeaders] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/leaderboard')
      .then(data => setLeaders(data.leaders ?? []))
      .catch(problem => setError(problem.message))
  }, [])

  const myId = me?.user?.id

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="ladder glass"
        role="dialog"
        aria-modal="true"
        aria-label="Royal coin leaderboard"
        onClick={event => event.stopPropagation()}
      >
        <header className="board-head">
          <div>
            <h2>Royal coin ladder</h2>
            <p>the ten richest purses · type /leaderboard in chat</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close the leaderboard">
            <Icon name="close" />
          </button>
        </header>

        <div className="board-list">
          {!leaders && !error && <p className="board-empty">counting the vaults…</p>}
          {error && <p className="auth-error">{error}</p>}
          {leaders?.length === 0 && (
            <p className="board-empty">No purses yet — the drip is still filling the first one.</p>
          )}
          {leaders?.map(person => (
            <div
              key={person.id}
              className={`ladder-row ${person.id === myId ? 'is-me' : ''}`}
            >
              <span className={`ladder-rank ${person.rank <= 3 ? `is-podium is-${person.rank}` : ''}`}>
                {person.rank}
              </span>
              <Avatar name={person.displayName} color={person.color} size={30} src={person.avatarUrl} />
              <span className="board-text">
                <span className="board-name">
                  {person.displayName}
                  {person.id === myId ? ' (you)' : ''}
                </span>
                <span className="board-room">@{person.username}</span>
              </span>
              <RoleBadge role={person.role} />
              <span className="ladder-coins">{money(person.coins)}</span>
            </div>
          ))}
        </div>

        <p className="vault-foot">balances move with every drip, bet, spin and steal.</p>
      </div>
    </div>
  )
}
