import { useEffect, useState } from 'react'
import Icon from './Icon'
import { api } from '../api'
import { money } from '../lib/format'
import { roleLabel, roleRank } from '../lib/roles'

/**
 * The rank shop: every rank above your own, at the price the clerk currently asks. Each
 * rank costs 10,000 coins and every purchase raises the next price by another 10,000, so
 * the server owns both the price and the change of role — this panel only asks.
 */
export default function RankShop({ me, onClose, onChanged }) {
  const [shop, setShop] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const unlimited = me.user.role === 'owner'
  const wallet = shop?.coins ?? me.user.coins

  useEffect(() => {
    api('/api/ranks')
      .then(setShop)
      .catch(problem => setError(problem.message))
  }, [])

  const buy = async role => {
    if (busy) return
    setBusy(role)
    setError('')
    setDone('')
    try {
      const data = await api('/api/ranks/buy', {
        method: 'POST',
        body: JSON.stringify({ role }),
      })
      // The server answers with the shop as it now stands (new price, ranks held).
      setShop(previous => ({
        ...(previous ?? {}),
        ...(data.shop ?? {}),
        coins: data.coins ?? previous?.coins,
      }))
      setDone(data.message)
      onChanged?.()
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="rank-shop glass"
        role="dialog"
        aria-modal="true"
        aria-label="Rank shop"
        onClick={event => event.stopPropagation()}
      >
        <header className="settings-head">
          <div>
            <h2>Rank shop</h2>
            <p>
              every rank is {money(10000)} · the more you buy, the more the next one costs
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close rank shop">
            <Icon name="close" />
          </button>
        </header>

        <div className="settings-body">
          <p className="rank-wallet">
            you hold {money(wallet?.coins, unlimited)} · you are {roleLabel(me.user.role)}
          </p>

          <div className="rank-list">
            {(shop?.ranks ?? []).map(entry => (
              <div key={entry.role} className={`rank-row ${entry.held ? 'is-held' : ''}`}>
                <span className="rank-badge">{roleRank(entry.role)}</span>
                <span className="rank-text">
                  <span className="rank-name">{entry.label}</span>
                  <span className="rank-note">
                    {entry.held ? 'already yours' : `next rank · ${money(shop.price)}`}
                  </span>
                </span>
                {entry.held ? (
                  <span className="rank-held">held</span>
                ) : (
                  <button
                    type="button"
                    className="pill-btn rank-buy"
                    disabled={!entry.buyable || Boolean(busy)}
                    onClick={() => buy(entry.role)}
                  >
                    {busy === entry.role ? 'buying…' : `buy ${money(shop.price)}`}
                  </button>
                )}
              </div>
            ))}
            {!shop && !error && <p className="board-empty">opening the shop…</p>}
            {shop && !shop.ranks.some(entry => entry.buyable) && (
              <p className="board-empty">every rank on sale is already yours.</p>
            )}
          </div>

          {error && <p className="auth-error">{error}</p>}
          {done && <p className="rank-done">{done}</p>}

          <div className="settings-actions">
            <button type="button" className="text-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
