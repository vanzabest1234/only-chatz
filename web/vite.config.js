import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = 'http://api:8000'

// Sandbox preview: the proxy hands us a rotating `<port>-<sandbox id>` host, so the
// allowlist is extended with a wildcard only while BASE44_PREVIEW_MODE is "1".
const allowedHosts = []
if (process.env.BASE44_PREVIEW_MODE === '1' && process.env.BASE44_SANDBOX_HOST_DOMAIN) {
  allowedHosts.push(`.${process.env.BASE44_SANDBOX_HOST_DOMAIN}`)
}

// Every front door opens the room: `/` plus the old launcher paths render the app in
// place. No HTTP redirect — a preview host treats a 302 on the root document as a routing
// failure — and no address-bar rewrite either: the preview only answers documents on the
// path it served, so the dev server leaves the URL alone (web/src/main.jsx rewrites it in a
// release build only). The release server does the same in server/index.js — keep this list
// identical to ENTRY_PATHS there.
const ENTRY_PATHS = new Set(['/', '/launcher.html', '/royal-angel', '/royal-angel.html'])

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
    allowedHosts: allowedHosts.length ? allowedHosts : undefined,
    proxy: {
      // xfwd forwards the caller's address, so the API's per-IP limits see the real
      // client instead of the proxy container.
      '/api': { target: API_TARGET, changeOrigin: true, xfwd: true },
      '/socket.io': { target: API_TARGET, ws: true, xfwd: true },
    },
  },
})
