import { useEffect, useState } from 'react'
import Icon from './Icon'
import { api } from '../api'

const money = value => Number(value ?? 0).toLocaleString('en-US')

/** The drip: 100 coins every ten minutes, so the panel counts down to the next one. */
function nextDrip(nextAt, now) {
  const left = new Date(nextAt).getTime() - now
  if (!Number.isFinite(left) || left <= 0) return 'any second'
  const minutes = Math.floor(left / 60_000)
  const seconds = Math.floor((left % 60_000) / 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * The Royal vault: your coin balance, the ten-minute drip, and a dice table where the
 * stake can come back doubled — or not come back at all. The roll happens on the server;
 * this panel only shows what it was told.
 */
export default function CasinoPanel({ me, onClose }) {
  const [table, setTable] = useState(null)
  const [risk, setRisk] = useState('even')
  const [wager, setWager] = useState('100')
  const [rolling, setRolling] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  const wallet = me?.user?.coins ?? {
    coins: 0,
    perTick: 100,
    tickMinutes: 10,
    nextAt: null,
    spinCost: 1000,
  }
  const balance = wallet.coins ?? 0
  const stakes = table?.risks ?? []
  const minBet = table?.minBet ?? 10
  const picked = stakes.find(item => item.key === risk) ?? stakes[0] ?? null

  const stake = Math.floor(Number(wager))
  const canRoll =
    Boolean(picked) && !rolling && Number.isFinite(stake) && stake >= minBet && stake <= balance

  useEffect(() => {
    api('/api/casino')
      .then(setTable)
      .catch(problem => setError(problem.message))
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const roll = async () => {
    if (!canRoll) return
    setRolling(true)
    setError('')
    setResult(null)
    try {
      const data = await api('/api/casino/bet', {
        method: 'POST',
        body: JSON.stringify({ wager: stake, risk: picked.key }),
      })
      setResult(data)
      setTable(previous => (previous ? { ...previous, bets: data.bets ?? previous.bets } : previous))
    } catch (problem) {
      setError(problem.message)
    } finally {
      setRolling(false)
    }
  }

  const setPreset = value => setWager(String(Math.max(minBet, Math.min(value, Math.max(balance, minBet)))))

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="vault-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="Royal vault"
        onClick={event => event.stopPropagation()}
      >
        <header className="settings-head">
          <div>
            <h2>Royal vault</h2>
            <p>royal coins · the dice table</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close the vault">
            <Icon name="close" />
          </button>
        </header>

        <div className="vault-hero">
          <span className="vault-coin" aria-hidden="true">
            ◉
          </span>
          <div>
            <span className="vault-balance">{money(balance)}</span>
            <span className="vault-balance-unit">royal coins</span>
          </div>
        </div>
        <p className="vault-drip">
          +{money(wallet.perTick)} every {wallet.tickMinutes} minutes · next drop in{' '}
          {nextDrip(wallet.nextAt, now)} · a wheel turn costs {money(wallet.spinCost)}
        </p>

        <div className="vault-risks">
          {stakes.map(item => (
            <button
              key={item.key}
              type="button"
              className={`risk-btn ${item.key === picked?.key ? 'is-picked' : ''}`}
              onClick={() => setRisk(item.key)}
              aria-pressed={item.key === picked?.key}
            >
              <span className="risk-name">{item.label}</span>
              <span className="risk-odds">roll 1–{item.chance}</span>
              <span className="risk-mult">{item.multiplier}×</span>
            </button>
          ))}
        </div>

        <div className="vault-bet">
          <label className="vault-field">
            <span>stake</span>
            <input
              type="text"
              inputMode="numeric"
              value={wager}
              onChange={event => setWager(event.target.value.replace(/[^0-9]/g, ''))}
              aria-label="Stake in royal coins"
            />
          </label>
          <div className="vault-presets">
            {[100, 500, 1000].map(amount => (
              <button key={amount} type="button" onClick={() => setPreset(amount)}>
                {money(amount)}
              </button>
            ))}
            <button type="button" onClick={() => setPreset(balance)}>
              all in
            </button>
          </div>
        </div>

        <button className="btn-primary vault-roll" onClick={roll} disabled={!canRoll}>
          {rolling ? 'rolling…' : picked ? `roll · ${money(stake || 0)} on ${picked.label}` : 'loading the table…'}
        </button>

        {result && (
          <div className={`vault-result ${result.won ? 'is-win' : 'is-loss'}`}>
            <span className="vault-die">{result.roll}</span>
            <div>
              <strong>
                {result.won ? `won ${money(result.payout)} coins` : `lost ${money(result.wager)} coins`}
              </strong>
              <span className="vault-result-line">
                needed 1–{result.chance} · {result.risk} stakes · you hold {money(result.coins?.coins)}
              </span>
            </div>
          </div>
        )}

        {error && <p className="auth-error">{error}</p>}

        {!result && !error && balance < minBet && (
          <p className="vault-hint">
            the table opens at {money(minBet)} coins — the drip is paying you 100 every 10 minutes.
          </p>
        )}

        {(table?.bets ?? []).length > 0 && (
          <div className="vault-history">
            <h3>last rolls</h3>
            {table.bets.map((bet, index) => (
              <div key={`${bet.at}-${index}`} className="vault-hist-row">
                <span className="vault-hist-roll">roll {bet.roll}</span>
                <span className="vault-hist-risk">{bet.risk}</span>
                <span className={`vault-hist-net ${bet.won ? 'is-win' : 'is-loss'}`}>
                  {bet.won ? `+${money(bet.payout - bet.wager)}` : `-${money(bet.wager)}`}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="vault-foot">
          every stake carries a house edge — play with what the drip gives you, never more.
        </p>
      </div>
    </div>
  )
}
