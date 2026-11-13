import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = 'http://api:8000'

// The room is opened from whatever address reaches it: the preview proxy, a phone on the
// LAN by IP or machine name, a tunnel, a custom domain. Vite's default allowlist only
// accepts localhost and bare IPs and answers everything else with "Blocked request", so
// the check is turned off here — a dev server is not the place to pin one hostname.
const allowedHosts = true

// Every front door opens the room: `/` plus the old launcher paths render the app in
// place. No HTTP redirect — a preview host treats a 302 on the root document as a routing
// failure — and no address-bar rewrite either: the preview only answers documents on the
// path it served, so the dev server leaves the URL alone (web/src/main.jsx rewrites it in a
// release build only). The release server does the same in server/index.js — keep this list
// identical to ENTRY_PATHS there.
// `/launcher.html` is deliberately not here: it is its own file in web/public (the two-choice
// page that opens the room in about:blank or an iframe), so it must reach the browser untouched.
const ENTRY_PATHS = new Set(['/', '/royal-angel', '/royal-angel.html'])

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

export default defineConfig({
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
