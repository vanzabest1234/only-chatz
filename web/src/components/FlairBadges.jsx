import { CUSTOM_FLAIR, flairColor, flairLabel } from '../lib/flairs'

/**
 * Every flair someone is wearing, in the order the server sent them.
 * A won custom tag paints the words its owner chose instead of a fixed label.
 */
export default function FlairBadges({ flairs, customTag = null, compact = false }) {
  if (!flairs?.length) return null
  return (
    <span className={`flair-row ${compact ? 'is-compact' : ''}`}>
      {flairs.map(key => {
        const custom = key === CUSTOM_FLAIR
        const label = custom ? customTag || flairLabel(key) : flairLabel(key)
        return (
          <span
            key={key}
            className={`flair ${custom ? 'flair-custom' : ''}`}
            style={{ '--flair': flairColor(key) }}
          >
            {label}
          </span>
        )
      })}
    </span>
  )
}
