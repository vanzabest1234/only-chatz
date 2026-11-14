/**
 * A display name painted by what the person holds: the owner wears red with a trident,
 * an MVP wears a rainbow with a crown, a VIP wears gold. Anything else stays plain.
 *
 * The owner holds every wheel flair, so the owner check comes first — the red trident
 * always wins over a rainbow they also happen to own.
 */
const MARKS = { 'is-owner': '🔱', 'is-mvp': '👑' }

export function nameTone(role, flairs = []) {
  if (role === 'owner') return 'is-owner'
  if (flairs.includes('mvp')) return 'is-mvp'
  if (flairs.includes('vip')) return 'is-vip'
  return ''
}

export default function PlayerName({ name, role, flairs, className = '' }) {
  const tone = nameTone(role, flairs)
  const mark = MARKS[tone]

  return (
    <span className={`player-name ${tone} ${className}`.trim()}>
      <span className="player-name-text">{name}</span>
      {mark && (
        <span className="name-mark" aria-hidden="true">
          {mark}
        </span>
      )}
    </span>
  )
}
