import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = 'http://api:8000'

// Sandbox preview: the proxy hands us a rotating `<port>-<sandbox id>` host, so the
// allowlist is extended with a wildcard only while BASE44_PREVIEW_MODE is "1".
const allowedHosts = []
if (process.env.BASE44_PREVIEW_MODE === '1' && process.env.BASE44_SANDBOX_HOST_DOMAIN) {
  allowedHosts.push(`.${process.env.BASE44_SANDBOX_HOST_DOMAIN}`)
}

// The room is the front door: `/` redirects straight to /chat (the query string, which
// carries a preview's access token, goes with it) and every other path renders the app
// via the SPA fallback. The release server does the same in server/index.js.
// `/royal-angel.html` (and `/royal-angel`) still show web/public/launcher.html, so a
// launcher edit lands on them at once — there is no second copy to keep in sync. Keep
// this list identical to LAUNCHER_PATHS in server/index.js.
const LAUNCHER_PATHS = new Set(['/launcher.html', '/royal-angel', '/royal-angel.html'])

function launcherAtRoot() {
  return {
    name: 'launcher-at-root',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET') return next()
        const [pathname, query] = (req.url ?? '/').split('?')
        const suffix = query ? `?${query}` : ''
        if (pathname === '/') {
          res.writeHead(302, { Location: `/chat${suffix}` })
          return res.end()
        }
        if (LAUNCHER_PATHS.has(pathname)) req.url = `/launcher.html${suffix}`
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), launcherAtRoot()],
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
