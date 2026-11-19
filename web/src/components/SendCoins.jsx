import { useState } from 'react'
import Avatar from './Avatar'
import Icon from './Icon'
import PlayerName from './PlayerName'
import { api } from '../api'
import { money, walletText } from '../lib/format'

const QUICK = [100, 1000, 10000]

/**
 * The hand-out window: pick a person, type an amount, and the coins move at once. The
 * server does the moving (both purses in one transaction), so this panel only reports it.
 */
export default function SendCoins({ me, onClose, onSent }) {
  const [query, setQuery] = useState('')
  const [toId, setToId] = useState(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')

  const needle = query.trim().toLowerCase()
  const others = me.members
    .filter(member => member.id !== me.user.id)
    .filter(
      member =>
        !needle ||
        member.displayName.toLowerCase().includes(needle) ||
        member.username.toLowerCase().includes(needle),
    )
    // Whoever is in the room floats to the top; the rest follow in name order.
    .sort(
      (a, b) =>
        Number(me.online.includes(b.id)) - Number(me.online.includes(a.id)) ||
        a.displayName.localeCompare(b.displayName),
    )

  const target = me.members.find(member => member.id === toId) ?? null
  const typed = amount.replace(/[,_\s]/g, '')
  const whole = /^\d+$/.test(typed) && BigInt(typed) > 0n

  const send = async () => {
    if (!target || !whole || busy) return
    setBusy(true)
    setError('')
    setSent('')
    try {
      const data = await api('/api/coins/send', {
        method: 'POST',
        body: JSON.stringify({ toUserId: target.id, amount: typed }),
      })
      if (data.coins) onSent?.(data.coins)
      setSent(`sent ${money(data.amount ?? typed)} to ${target.displayName}.`)
      setAmount('')
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="coin-send glass"
        role="dialog"
        aria-modal="true"
        aria-label="Send royal coins"
        onClick={event => event.stopPropagation()}
      >
        <header className="settings-head">
          <div>
            <h2>Send royal coins</h2>
            <p>you hold {walletText(me.user.coins)} · coins move instantly</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close send coins">
            <Icon name="close" />
          </button>
        </header>

        <div className="settings-body">
          <label className="field">
            <span>Who</span>
            <input
              value={query}
              placeholder="search a name"
              onChange={event => setQuery(event.target.value)}
            />
          </label>

          <div className="coin-people">
            {others.map(member => (
              <button
                key={member.id}
                type="button"
                className={`ladder-row coin-person ${member.id === toId ? 'is-picked' : ''}`}
                onClick={() => setToId(member.id)}
              >
                <Avatar
                  name={member.displayName}
                  color={member.color}
                  size={26}
                  online={me.online.includes(member.id)}
                  src={member.avatarUrl}
                />
                <span className="board-text">
                  <PlayerName
                    className="board-name"
                    name={member.displayName}
                    role={member.role}
                    flairs={member.flairs}
                  />
                  <span className="board-room">@{member.username}</span>
                </span>
                {member.id === toId && <Icon name="check" size={15} />}
              </button>
            ))}
            {!others.length && <p className="board-empty">nobody matches that name.</p>}
          </div>

          <label className="field">
            <span>Amount</span>
            <input
              value={amount}
              inputMode="numeric"
              placeholder="0"
              onChange={event => setAmount(event.target.value)}
            />
          </label>

          <div className="coin-quick">
            {QUICK.map(value => (
              <button
                key={value}
                type="button"
                className="pill-btn"
                onClick={() => setAmount(String(value))}
              >
                {money(value)}
              </button>
            ))}
          </div>

          {error && <p className="auth-error">{error}</p>}
          {sent && <p className="coin-sent">{sent}</p>}

          <div className="settings-actions">
            <button type="button" className="text-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={send}
              disabled={!target || !whole || busy}
            >
              {busy ? 'sending…' : target ? `send to ${target.displayName}` : 'pick someone'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
