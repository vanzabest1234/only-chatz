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

function countdown(target, now) {
  const left = target - now
  if (left <= 0) return ''
  const hours = Math.floor(left / 3_600_000)
  const minutes = Math.floor((left % 3_600_000) / 60_000)
  if (hours) return `${hours}h ${minutes}m`
  const seconds = Math.ceil((left % 60_000) / 1000)
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`
}

export default function FlairWheel({ onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [angle, setAngle] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [won, setWon] = useState(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  const wheel = useMemo(() => (data?.catalog ?? []).filter(item => item.wheel), [data])
  const owned = useMemo(
    () => new Map((data?.owned ?? []).map(entry => [entry.flair, entry])),
    [data],
  )
  const seg = wheel.length ? 360 / wheel.length : 360
  const readyAt = data?.nextSpinAt ? new Date(data.nextSpinAt).getTime() : 0
  const wait = readyAt > now ? countdown(readyAt, now) : ''
  const canSpin = Boolean(data) && !spinning && !wait

  useEffect(() => {
    api('/api/flairs')
      .then(setData)
      .catch(problem => setError(problem.message))
  }, [])

  useEffect(() => {
    if (!data?.nextSpinAt) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [data?.nextSpinAt])

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
              nextSpinAt: new Date(result.nextSpinAt).toISOString(),
            }
          : previous,
      )
      setNow(Date.now())
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
            <p>pure decoration · wear as many as you like</p>
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
            {spinning ? 'spinning…' : wait ? `recharging · ${wait}` : 'spin the wheel'}
          </button>
          {won && (
            <p className="wheel-result" style={{ '--flair': flairColor(won.key) }}>
              {won.duplicate
                ? `you rolled ${flairLabel(won.key)} again — already yours`
                : `you won ${flairLabel(won.key)}`}
            </p>
          )}
          {!won && !error && data && !wait && (
            <p className="wheel-hint">one spin a day · vip 1% · mvp 0.1%</p>
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
