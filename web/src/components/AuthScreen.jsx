import { useState } from 'react'
import { api, setToken } from '../api'

export default function AuthScreen({ onAuthed, notice }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body =
        mode === 'login' ? { username, password } : { username, password, displayName }
      const data = await api(path, { method: 'POST', body: JSON.stringify(body) })
      setToken(data.token)
      await onAuthed()
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card glass">
        <div className="auth-brand">
          <div className="brand-glyph">◍</div>
          <div>
            <h1>Only Chatz</h1>
            <p>everyone, floating together</p>
          </div>
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'join'}
            className={mode === 'join' ? 'active' : ''}
            onClick={() => setMode('join')}
          >
            Join
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>Username</span>
            <input
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="yourname"
              required
            />
          </label>

          {mode === 'join' && (
            <label className="field">
              <span>Display name</span>
              <input
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
                placeholder="Your Name"
              />
            </label>
          )}

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••"
              required
            />
          </label>

          {notice && <p className="auth-note">{notice}</p>}
          {error && <p className="auth-error">{error}</p>}

          <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'One moment…' : mode === 'login' ? 'Step inside' : 'Create my account'}
          </button>
        </form>
      </div>
    </div>
  )
}
