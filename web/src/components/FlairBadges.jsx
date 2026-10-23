import { flairColor, flairLabel } from '../lib/flairs'

/** Every flair someone is wearing, in the order the server sent them. */
export default function FlairBadges({ flairs, compact = false }) {
  if (!flairs?.length) return null
  return (
    <span className={`flair-row ${compact ? 'is-compact' : ''}`}>
      {flairs.map(key => (
        <span key={key} className="flair" style={{ '--flair': flairColor(key) }}>
          {flairLabel(key)}
        </span>
      ))}
    </span>
  )
}
