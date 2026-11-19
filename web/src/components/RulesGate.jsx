// The ten rules, shown once per account. Posting stays locked until "i accept".
export const CHAT_RULES = [
  'One account per person. Alts used to dodge a mute get both accounts removed.',
  'No harassment, hate speech, threats or slurs. Argue with ideas, never with people.',
  'No spam: no flooding, no copy-pasted walls, no repeated pings.',
  'Never post anyone’s private information — real name, address, number, workplace.',
  'Keep it clean for a public room. No porn, gore or shock material.',
  'No advertising, referral links, crypto pitches or scam bait.',
  'Stay on topic for the room you are in. #announcements is read-only for everyone but the Owner.',
  'No impersonation. Do not pose as staff, and do not copy another member’s name or avatar.',
  'No pirated software, cracks or links to malware and phishing pages.',
  'Staff calls are final. Disagree in a DM with the Owner, never by relitigating in the rooms.',
]

export default function RulesGate({ declined, busy, error, onAccept, onDecline }) {
  return (
    <div className="modal-scrim">
      <div className="rules glass" role="dialog" aria-modal="true" aria-label="Chat rules">
        <header className="rules-head">
          <h2>top 10 rules</h2>
          <p>
            {declined
              ? 'you declined these rules — you can read every room, but not post. accept to unlock the composer.'
              : 'read these before you post. you have to accept them to chat.'}
          </p>
        </header>

        <ol className="rules-list">
          {CHAT_RULES.map((rule, index) => (
            <li key={rule}>
              <span className="rules-num">{String(index + 1).padStart(2, '0')}</span>
              <span className="rules-text">{rule}</span>
            </li>
          ))}
        </ol>

        {error && <p className="auth-error">{error}</p>}

        <footer className="rules-actions">
          <button type="button" className="text-btn" onClick={onDecline} disabled={busy}>
            i don’t agree
          </button>
          <button type="button" className="btn-primary" onClick={onAccept} disabled={busy}>
            {busy ? 'saving…' : 'i accept the rules'}
          </button>
        </footer>

        <p className="rules-foot">
          refusing keeps your account — you just cannot send messages until you accept.
        </p>
      </div>
    </div>
  )
}
