import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = 'http://api:8000'

// Sandbox preview: the proxy hands us a rotating `<port>-<sandbox id>` host, so the
// allowlist is extended with a wildcard only while BASE44_PREVIEW_MODE is "1".
const allowedHosts = []
if (process.env.BASE44_PREVIEW_MODE === '1' && process.env.BASE44_SANDBOX_HOST_DOMAIN) {
  allowedHosts.push(`.${process.env.BASE44_SANDBOX_HOST_DOMAIN}`)
}

// The launcher is the landing page: `/` shows web/public/launcher.html and the
// room itself lives on /chat (every other path renders the app via the SPA
// fallback). The release server does the same in server/index.js.
function launcherAtRoot() {
  return {
    name: 'launcher-at-root',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
          req.url = '/launcher.html' + req.url.slice(1)
        }
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
