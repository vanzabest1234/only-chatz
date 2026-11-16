import { useEffect, useState } from 'react'
import { api } from '../api'
import { money, walletText } from '../lib/format'
import { flairColor } from '../lib/flairs'

/**
 * The flairs on sale, shown inside the daily wheel. Every flair costs 10,000 coins and every
 * purchase raises the next price by another 10,000; the server owns both the price and the
 * ladder, so this section only asks.
 */
export default function RankOffers({ coins, onChanged }) {
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
        body: JSON.stringify({ flair: next }),
      })
      // The server answers with the shop as it now stands (new price, flairs held).
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
    <section className="wheel-ranks" aria-label="Flairs for sale">
      <header className="wheel-ranks-head">
        <h3>flairs for sale</h3>
        <span>one rung at a time</span>
      </header>

      <p className="rank-wallet">
        you hold {walletText(wallet)} · the first flair is {money(10000)}, each
        purchase adds {money(10000)}
      </p>

      <div className="rank-list">
        {(shop?.ranks ?? []).map((entry, index) => (
          <div
            key={entry.flair}
            className={`rank-row ${entry.held ? 'is-held' : ''} ${entry.locked ? 'is-locked' : ''}`}
            style={{ '--flair': flairColor(entry.flair) }}
          >
            <span className="rank-badge">{index + 1}</span>
            <span className="rank-text">
              <span className="rank-name">{entry.label}</span>
              <span className="rank-note">
                {entry.held
                  ? 'already yours'
                  : entry.locked
                    ? `locked · buy ${shop.ranks[index - 1]?.label ?? 'the one before'} first`
                    : `next flair · ${money(shop.price)}`}
              </span>
            </span>
            {entry.held ? (
              <span className="rank-held">held</span>
            ) : entry.locked ? (
              <span className="rank-locked">locked</span>
            ) : (
              <button
                type="button"
                className="pill-btn rank-buy"
                disabled={Boolean(busy)}
                onClick={() => buy(entry.flair)}
              >
                {busy === entry.flair ? 'buying…' : `buy ${money(shop.price)}`}
              </button>
            )}
          </div>
        ))}
        {!shop && !error && <p className="board-empty">opening the shop…</p>}
        {shop && !shop.ranks.some(entry => entry.buyable) && (
          <p className="board-empty">every flair on sale is already yours.</p>
        )}
      </div>

      {error && <p className="auth-error">{error}</p>}
      {done && <p className="rank-done">{done}</p>}
    </section>
  )
}
