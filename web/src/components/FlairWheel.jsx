import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { api } from '../api'
import { flairColor, flairLabel } from '../lib/flairs'

const TURNS = 5
const SPIN_MS = 4200

const toRadians = angle => ((angle - 90) * Math.PI) / 180

function polar(radius, angle) {
  return { x: 100 + Math.cos(toRadians(angle)) * radius, y: 100 + Math.sin(toRadians(angle)) * radius }
}

function slicePath(start, end) {
  const from = polar(100, start)
  const to = polar(100, end)
  const large = end - start > 180 ? 1 : 0
  return `M100 100 L${from.x} ${from.y} A100 100 0 ${large} 1 ${to.x} ${to.y} Z`
}

const money = value => Number(value ?? 0).toLocaleString('en-US')

export default function FlairWheel({ coins, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [angle, setAngle] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [won, setWon] = useState(null)
  const [error, setError] = useState('')

  const wheel = useMemo(() => (data?.catalog ?? []).filter(item => item.wheel), [data])
  const owned = useMemo(
    () => new Map((data?.owned ?? []).map(entry => [entry.flair, entry])),
    [data],
  )
  const seg = wheel.length ? 360 / wheel.length : 360
  const tokens = data?.spinTokens ?? 0
  // The live balance comes from the app (it is pushed over the socket as the drip pays);
  // the copy fetched with the wheel is only a fallback for the first frame.
  const wallet = coins ?? data?.coins ?? { coins: 0, spinCost: 1000 }
  const cost = wallet.spinCost ?? 1000
  // A banked pass token is a free turn; otherwise a turn is paid for in royal coins.
  const affordable = tokens > 0 || (wallet.coins ?? 0) >= cost
  const canSpin = Boolean(data) && !spinning && affordable

  useEffect(() => {
    api('/api/flairs')
      .then(setData)
      .catch(problem => setError(problem.message))
  }, [])

  // The landing slice is the one the server already rolled; the wheel only animates to it.
  const land = useCallback(
    (result, duplicate) => {
      const index = Math.max(0, wheel.findIndex(item => item.key === result.key))
      const centre = index * seg + seg / 2
      setAngle(previous => {
        const current = ((previous % 360) + 360) % 360
        const delta = ((360 - centre) - current + 360) % 360
        return previous + TURNS * 360 + delta
      })
      setTimeout(() => {
        setSpinning(false)
        setWon({ ...result, duplicate })
        onChanged?.()
      }, SPIN_MS + 150)
    },
    [wheel, seg, onChanged],
  )

  const spin = async () => {
    if (!canSpin) return
    setError('')
    setWon(null)
    setSpinning(true)
    try {
      const result = await api('/api/flairs/spin', { method: 'POST' })
      setData(previous =>
        previous
          ? {
              ...previous,
              owned: result.owned,
              spinTokens: result.spinTokens ?? 0,
              customTag: result.customTag ?? previous.customTag,
              coins: result.coins ?? previous.coins,
            }
          : previous,
      )
      land(result.won, result.duplicate)
    } catch (problem) {
      setSpinning(false)
      setError(problem.message)
      api('/api/flairs').then(setData).catch(() => {})
    }
  }

  const toggle = async key => {
    const entry = owned.get(key)
    if (!entry || spinning) return
    try {
      const result = await api('/api/flairs/equip', {
        method: 'POST',
        body: JSON.stringify({ flair: key, equipped: !entry.equipped }),
      })
      setData(previous => (previous ? { ...previous, owned: result.owned } : previous))
      onChanged?.()
    } catch (problem) {
      setError(problem.message)
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="wheel-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="Flair wheel"
        onClick={event => event.stopPropagation()}
      >
        <header className="settings-head">
          <div>
            <h2>Flair wheel</h2>
            <p>pure decoration · wear up to {data?.maxEquipped ?? 3} at once</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close the wheel">
            <Icon name="close" />
          </button>
        </header>

        <div className="wheel-stage">
          <span className="wheel-pointer" aria-hidden="true" />
          <div
            className="wheel-disc"
            style={{
              transform: `rotate(${angle}deg)`,
              transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.86, 0.16, 1)` : 'none',
            }}
          >
            <svg viewBox="0 0 200 200" role="img" aria-label="Flair wheel">
              {wheel.map((item, index) => (
                <path
                  key={item.key}
                  d={slicePath(index * seg, (index + 1) * seg)}
                  fill={flairColor(item.key)}
                  stroke="#0a0f14"
                  strokeWidth="1"
                />
              ))}
              {wheel.map((item, index) => {
                const centre = index * seg + seg / 2
                const point = polar(63, centre)
                const flip = centre > 90 && centre < 270
                return (
                  <text
                    key={item.key}
                    className="wheel-label"
                    x={point.x}
                    y={point.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${flip ? centre + 90 : centre - 90} ${point.x} ${point.y})`}
                  >
                    {flairLabel(item.key)}
                  </text>
                )
              })}
              <circle cx="100" cy="100" r="9" fill="#0a0f14" stroke="#74f0a6" strokeWidth="1.5" />
            </svg>
          </div>
        </div>

        <div className="wheel-actions">
          <button className="btn-primary" onClick={spin} disabled={!canSpin}>
            {spinning
              ? 'spinning…'
              : tokens > 0
                ? `spin · ${tokens} free turn${tokens === 1 ? '' : 's'}`
                : `spin · ${money(cost)} royal coins`}
          </button>
          {won && (
            <p className="wheel-result" style={{ '--flair': flairColor(won.key) }}>
              {won.duplicate
                ? `you rolled ${flairLabel(won.key)} again — already yours`
                : `you won ${flairLabel(won.key)}`}
              {won.key === 'custom' && !won.duplicate && ' — write your tag in settings'}
            </p>
          )}
          {!won && !error && data && (
            <p className="wheel-hint">
              you hold {money(wallet.coins)} coins · +100 every {wallet.tickMinutes ?? 10} min · vip
              1% · mvp 0.1% · custom tag 0.01%
            </p>
          )}
          {!won && !error && data && !affordable && (
            <p className="wheel-hint">
              need {money(cost - (wallet.coins ?? 0))} more — the royal drip pays 100 every 10
              minutes
            </p>
          )}
          {error && <p className="auth-error">{error}</p>}
        </div>

        <div className="flair-list">
          {(data?.catalog ?? []).map(item => {
            const entry = owned.get(item.key)
            return (
              <div
                key={item.key}
                className={`flair-item ${entry ? '' : 'is-locked'}`}
                style={{ '--flair': flairColor(item.key) }}
              >
                <span className="flair-dot" aria-hidden="true" />
                <span className="flair-item-name">{flairLabel(item.key)}</span>
                {item.odds && <span className="flair-odds">{item.odds}</span>}
                {!item.wheel && <span className="flair-odds">not on the wheel</span>}
                {entry ? (
                  <button
                    type="button"
                    className={`flair-toggle ${entry.equipped ? 'is-on' : ''}`}
                    onClick={() => toggle(item.key)}
                    aria-pressed={entry.equipped}
                  >
                    {entry.equipped ? 'equipped' : 'equip'}
                  </button>
                ) : (
                  <span className="flair-odds">locked</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
