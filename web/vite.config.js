import { readFileSync } from 'node:fs'
import { createLogger, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = 'http://api:8000'
// server/index.js swaps the same placeholder with its own address in a release.
const ROOM_SLOT = 'data-room="__CHATZ_ROOM__"'

// The room is opened from whatever address reaches it: the preview proxy, a phone on the
// LAN by IP or machine name, a tunnel, a custom domain. Vite's default allowlist only
// accepts localhost and bare IPs and answers everything else with "Blocked request", so
// the check is turned off here — a dev server is not the place to pin one hostname.
const allowedHosts = true

// A tab that reloads, closes or loses its network drops the socket without a close frame, so
// http-proxy reports `read ECONNRESET` for that abandoned websocket on every load. That is
// teardown noise, not a failed request; keep it out of the log so a real proxy error stands out.
function roomLogger() {
  const logger = createLogger()
  const fail = logger.error.bind(logger)
  logger.error = (message, options) => {
    if (typeof message === 'string' && message.includes('ws proxy socket error') && message.includes('ECONNRESET')) return
    // The API runs under `node --watch` in development, so an edit closes its port for a moment
    // and a request landing in that gap comes back refused. Recreating the container kills the
    // request mid-flight (`read ECONNRESET`) and briefly drops its name from DNS (`ENOTFOUND`).
    // The tab retries on its next poll and the healthcheck fails if the API stays down, so a
    // restart reads as a notice, not a stack.
    const restartCodes = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND']
    if (
      typeof message === 'string' &&
      message.includes('http proxy error') &&
      restartCodes.includes(options?.error?.code)
    ) {
      const request = message.split('\n')[0].replace(/\u001b\[[0-9;]*m/g, '').replace(/^.*http proxy error:\s*/, '')
      logger.warn(`api restarting, ${request} retries on the next poll`, { timestamp: true })
      return
    }
    fail(message, options)
  }
  return logger
}

// The room is the front door: `/` renders the app itself, so a visitor lands in the chat with
// nothing to click first. These paths all render the app in place. No HTTP redirect — a
// preview host treats a 302 on the root document as a routing failure — and no address-bar
// rewrite either: the preview only answers documents on the path it served, so the dev server
// leaves the URL alone (web/src/main.jsx rewrites it in a release build only). The release
// server does the same in server/index.js — keep this list identical to ENTRY_PATHS there.
const ENTRY_PATHS = new Set(['/', '/chat', '/royal-angel', '/royal-angel.html'])

function frontDoorToChat() {
  return {
    name: 'front-door-to-chat',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.method === 'GET') {
          const [pathname, query] = (req.url ?? '/').split('?')
          if (ENTRY_PATHS.has(pathname)) req.url = '/index.html' + (query ? `?${query}` : '')
        }
        next()
      })
    },
  }
}

// The address a visitor's browser can actually reach, which is the page they downloaded from:
// a proxy in front (the preview host) rewrites Host to an internal name and forwards no
// X-Forwarded-Proto, but the same-origin download carries that page as the referer.
function roomOrigin(req) {
  try {
    const fromPage = new URL(req.headers.referer)
    if (fromPage.protocol === 'http:' || fromPage.protocol === 'https:') return fromPage.origin
  } catch {
    // No usable referer: fall back to this request's own address.
  }
  const forwarded = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim()
  const host = req.headers.host ?? ''
  if (forwarded) return `${forwarded}://${host}`
  return `${/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? 'http' : 'https'}://${host}`
}

// The one-file room is downloaded from this server, so the file is stamped with this server's
// address as it goes out: a copy saved to disk then signs in without being asked for a room
// address. Served here it matches the page's own origin, which the app ignores.
function stampRoomAddress() {
  return {
    name: 'stamp-room-address',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' || (req.url ?? '').split('?')[0] !== '/only-chatz.html') return next()
        let html
        try {
          html = readFileSync(new URL('./public/only-chatz.html', import.meta.url), 'utf8')
        } catch {
          return next()
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        // A copy saved to disk pulls this file back to update itself, and it asks from its own
        // address (file:, or another site), which the browser treats as cross-origin. The release
        // server already echoes the caller's Origin on every path; this is the same echo for the
        // one route the dev server answers itself, so the update works from the preview too.
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
        res.setHeader('Vary', 'Origin')
        res.end(html.replace(ROOM_SLOT, `data-room="${roomOrigin(req)}"`))
      })
    },
  }
}

export default defineConfig({
  customLogger: roomLogger(),
  plugins: [react(), frontDoorToChat(), stampRoomAddress()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts,
    // Vite's own CORS middleware answers an OPTIONS preflight itself (204, no
    // Access-Control-Allow-Origin for an unexpected origin), so a copy of the room opened from
    // another site never got its token request through the proxy. The API owns CORS — it echoes
    // the caller's Origin for exactly this case — so let every request reach it instead.
    cors: false,
    proxy: {
      // xfwd forwards the caller's address, so the API's per-IP limits see the real
      // client instead of the proxy container.
      '/api': { target: API_TARGET, changeOrigin: true, xfwd: true },
      '/socket.io': { target: API_TARGET, ws: true, xfwd: true },
    },
  },
})
