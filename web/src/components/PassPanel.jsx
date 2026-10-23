import Icon from './Icon'

/**
 * The season pass: time in the building is XP, XP clears tiers, tiers hand out cosmetics.
 * Nothing here is a flair — frames, the pass badge and extra turns of the wheel are the pot.
 */
export default function PassPanel({ pass, onClose }) {
  if (!pass) return null

  const capped = pass.tier >= pass.maxTier
  const pct = capped ? 100 : Math.min(100, Math.round((pass.xpInto / pass.tierXp) * 100))

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="pass-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="Season pass"
        onClick={event => event.stopPropagation()}
      >
        <header className="settings-head">
          <div>
            <h2>Season pass</h2>
            <p>season {pass.season} · stay a while, climb the tiers</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close the pass">
            <Icon name="close" />
          </button>
        </header>

        <div className="pass-hero">
          <div className="pass-tier">
            <span className="pass-tier-num">{pass.tier}</span>
            <span className="pass-tier-cap">/ {pass.maxTier}</span>
          </div>
          <div className="pass-meter">
            <div className="pass-bar">
              <span style={{ width: `${pct}%` }} />
            </div>
            <p className="pass-progress">
              {capped
                ? 'top tier cleared — the season badge is yours until the reset'
                : `${pass.xpInto} / ${pass.tierXp} xp to tier ${pass.tier + 1}`}
            </p>
          </div>
        </div>

        <p className="pass-note">
          {pass.xpPerMinute} xp for every minute a tab is open in the rooms · {pass.minutes} minutes
          this season · the clock stops the second you leave.
        </p>

        {pass.spinTokens > 0 && (
          <p className="pass-tokens">✦ {pass.spinTokens} extra spin{pass.spinTokens === 1 ? '' : 's'} banked</p>
        )}

        <div className="pass-list">
          {pass.tiers.map(entry => (
            <div key={entry.tier} className={`pass-row ${entry.unlocked ? 'is-open' : ''}`}>
              <span className="pass-row-tier">tier {entry.tier}</span>
              <span className="pass-row-rewards">
                {entry.rewards.map(reward => reward.text).join(' + ')}
              </span>
              <span className="pass-row-state">{entry.unlocked ? 'unlocked' : 'locked'}</span>
            </div>
          ))}
        </div>

        <p className="pass-foot">
          frames wrap your picture wherever it shows, and the tier badge sits next to your name.
        </p>
      </div>
    </div>
  )
}
