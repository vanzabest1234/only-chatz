const TOKEN_KEY = 'onlychatz_token'
const SERVER_KEY = 'onlychatz_server'

// localStorage can be unavailable — Safari blocks it in a third-party frame — and a blocked
// store must not take the room down with it. A tab that cannot store forgets the session when
// it closes.
const memory = new Map()

function read(key) {
  if (memory.has(key)) return memory.get(key)
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key, value) {
  // Kept in memory as well, so a tab whose storage is blocked still reaches the room it was
  // just told about and keeps its session until it closes.
  memory.set(key, value || null)
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // Nothing to do: this tab cannot remember it beyond its lifetime.
  }
}

export function getToken() {
  return read(TOKEN_KEY)
}

export function setToken(token) {
  write(TOKEN_KEY, token)
}

// The room is single-origin: served by it, these calls are relative and nothing is stored.
// A copy of only-chatz.html opened from disk (or from another site) has no server behind it,
// so it saves the address it was told to use and everything points there instead.
export function normalizeServer(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.origin
  } catch {
    return ''
  }
}

export function getServer() {
  return normalizeServer(read(SERVER_KEY))
}

export function setServer(value) {
  write(SERVER_KEY, normalizeServer(value))
}

// Where the API and the socket live: empty when this page came from the room itself.
export function baseUrl() {
  return getServer()
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const base = baseUrl()
  let response
  try {
    response = await fetch(`${base}${path}`, { method, headers, body })
  } catch {
    // A phone off the network, a wrong room address and a stopped room all arrive here as
    // one opaque network error, so say what the reader can act on.
    throw new Error(
      base
        ? `Cannot reach the room at ${base}. Check the address and try again.`
        : 'Cannot reach the room from here. Open only-chatz.html from the room itself, or enter its address.',
    )
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong.')
    error.status = response.status
    throw error
  }
  return data
}
