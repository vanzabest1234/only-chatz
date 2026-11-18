import { useEffect, useState } from 'react'
import { api, getServer, normalizeServer, setServer, setToken } from '../api'

export default function AuthScreen({ onAuthed, notice }) {
  const [mode, setMode] = useState('login')
  // Only a copy opened outside the room asks for one — served by the room, the address is
  // this page's own origin and the field never appears.
  const [address, setAddress] = useState(getServer())
  const [standalone, setStandalone] = useState(
    window.location.protocol === 'file:' || Boolean(getServer()),
  )

  // The single-file build carries no server of its own, so a copy served by another static
  // host (GitHub Pages, another site) has nowhere for its relative /api calls to land. Ask
  // that host once: no version endpoint means this copy needs the room's address.
  useEffect(() => {
    if (standalone || import.meta.env.VITE_SINGLE_FILE !== '1') return
    let live = true
    fetch('/api/version')
      .then(response => {
        if (live && !response.ok) setStandalone(true)
      })
      .catch(() => {
        if (live) setStandalone(true)
      })
    return () => {
      live = false
    }
  }, [standalone])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (mode === 'join' && password !== confirm) {
      setError('Those passwords do not match.')
      return
    }
    if (standalone) {
      const room = normalizeServer(address)
      if (!room) {
        setError('Enter the room address, like https://your-room.example.')
        return
      }
      setServer(room)
    }
    setBusy(true)
    setError('')
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const data = await api(path, { method: 'POST', body: JSON.stringify({ username, password }) })
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
      <div className="auth-stack">
        <div className="auth-hero">
          <span className="auth-badge">live chatroom</span>
          <div className="brand-glyph">◍</div>
          <h1 className="auth-wordmark">Only Chatz</h1>
          <p className="auth-welcome">Welcome to the room</p>
          <p className="auth-lede">
            A small real-time chatroom — live channels, direct messages, royal coins and a board
            that shows who is floating where.
          </p>
        </div>

        <div className="auth-card glass">
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
            {standalone && (
              <label className="field">
                <span>Room address</span>
                <input
                  value={address}
                  onChange={event => setAddress(event.target.value)}
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://your-room.example"
                  required
                />
              </label>
            )}

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

            {mode === 'join' && (
              <label className="field">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={event => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••"
                  required
                />
              </label>
            )}

            {notice && <p className="auth-note">{notice}</p>}
            {error && <p className="auth-error">{error}</p>}

            <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
              {busy ? 'One moment…' : mode === 'login' ? 'Step inside' : 'Create my account'}
            </button>
          </form>
        </div>

        <p className="auth-foot">
          {mode === 'login' ? 'new here? ' : 'already have an account? '}
          <button type="button" className="text-btn" onClick={() => setMode(mode === 'login' ? 'join' : 'login')}>
            {mode === 'login' ? 'join the room' : 'sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
