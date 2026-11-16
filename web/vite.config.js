import { createLogger, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = 'http://api:8000'

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
    fail(message, options)
  }
  return logger
}

// The launcher is the front door and the room lives at `/chat`: `/` serves the launcher card
// (a real file in web/public) and these paths render the app in place. No HTTP redirect — a
// preview host treats a 302 on the root document as a routing failure — and no address-bar
// rewrite either: the preview only answers documents on the path it served, so the dev server
// leaves the URL alone (web/src/main.jsx rewrites it in a release build only). The release
// server does the same in server/index.js — keep this list identical to ENTRY_PATHS there.
const ENTRY_PATHS = new Set(['/chat', '/royal-angel', '/royal-angel.html'])

function frontDoorToChat() {
  return {
    name: 'front-door-to-chat',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.method === 'GET') {
          const [pathname, query] = (req.url ?? '/').split('?')
          if (pathname === '/') req.url = '/launcher.html'
          else if (ENTRY_PATHS.has(pathname)) req.url = '/index.html' + (query ? `?${query}` : '')
        }
        next()
      })
    },
  }
}

export default defineConfig({
  customLogger: roomLogger(),
  plugins: [react(), frontDoorToChat()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts,
    proxy: {
      // xfwd forwards the caller's address, so the API's per-IP limits see the real
      // client instead of the proxy container.
      '/api': { target: API_TARGET, changeOrigin: true, xfwd: true },
      '/socket.io': { target: API_TARGET, ws: true, xfwd: true },
    },
  },
})
