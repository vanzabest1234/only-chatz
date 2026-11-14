import { useEffect, useState } from 'react'
import { api } from '../api'
import { money } from '../lib/format'
import { roleLabel, roleRank } from '../lib/roles'

/**
 * The ranks on sale, shown inside the flair wheel. Every rank costs 10,000 coins and every
 * purchase raises the next price by another 10,000; the server owns both the price and the
 * change of role, so this section only asks.
 */
export default function RankOffers({ role, unlimited = false, coins, onChanged }) {
  const [shop, setShop] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const wallet = shop?.coins ?? coins

  useEffect(() => {
    api('/api/ranks')
      .then(setShop)
      .catch(problem => setError(problem.message))
  }, [])

  const buy = async next => {
    if (busy) return
    setBusy(next)
    setError('')
    setDone('')
    try {
      const data = await api('/api/ranks/buy', {
        method: 'POST',
        body: JSON.stringify({ role: next }),
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
    <section className="wheel-ranks" aria-label="Ranks for sale">
      <header className="wheel-ranks-head">
        <h3>ranks for sale</h3>
        <span>you are {roleLabel(role)}</span>
      </header>

      <p className="rank-wallet">
        you hold {money(wallet?.coins, unlimited)} · the first rank is {money(10000)}, each
        purchase adds {money(10000)}
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
        {!shop && !error && <p className="board-empty">opening the ranks…</p>}
        {shop && !shop.ranks.some(entry => entry.buyable) && (
          <p className="board-empty">every rank on sale is already yours.</p>
        )}
      </div>

      {error && <p className="auth-error">{error}</p>}
      {done && <p className="rank-done">{done}</p>}
    </section>
  )
}
