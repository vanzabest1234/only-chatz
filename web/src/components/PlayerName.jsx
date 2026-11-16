/**
 * A display name painted by what the person holds: the owner wears red with a trident,
 * a co-owner wears purple, an MVP wears a rainbow with a crown, a VIP wears gold.
 * Anything else stays plain.
 *
 * The owner holds every wheel flair, so the owner check comes first — the red trident
 * always wins over a rainbow they also happen to own. A role outranks a flair, so the
 * co-owner purple wins over an MVP rainbow the same account may also be wearing.
 *
 * Given an `onClick` the name becomes a button, so tapping it opens that person's profile.
 */
const MARKS = { 'is-owner': '🔱', 'is-mvp': '👑' }

export function nameTone(role, flairs = []) {
  if (role === 'owner') return 'is-owner'
  if (role === 'co-owner') return 'is-coowner'
  if (flairs.includes('mvp')) return 'is-mvp'
  if (flairs.includes('vip')) return 'is-vip'
  return ''
}

export default function PlayerName({ name, role, flairs, className = '', onClick }) {
  const tone = nameTone(role, flairs)
  const mark = MARKS[tone]
  const label = `player-name ${tone} ${className}`.trim()

  const body = (
    <>
      <span className="player-name-text">{name}</span>
      {mark && (
        <span className="name-mark" aria-hidden="true">
          {mark}
        </span>
      )}
    </>
  )

  if (!onClick) return <span className={label}>{body}</span>

  return (
    <button
      type="button"
      className={`${label} is-clickable`}
      onClick={onClick}
      title={`View ${name}'s profile`}
    >
      {body}
    </button>
  )
}
