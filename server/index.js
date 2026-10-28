import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

import { migrate, waitForDb } from './db.js'
import { initRealtime } from './realtime.js'
import { seed } from './seed.js'
import { limiter } from './guard.js'
import authRoutes from './routes/auth.js'
import chatRoutes from './routes/chat.js'
import profileRoutes from './routes/profile.js'
import flairRoutes from './routes/flairs.js'
import casinoRoutes from './routes/casino.js'
import leaderboardRoutes from './routes/leaderboard.js'

const PORT = Number(process.env.PORT ?? 8000)
const WEB_DIR = process.env.WEB_DIR || fileURLToPath(new URL('../web/dist', import.meta.url))
// Every front door, all answering a 302 to /chat. Mirrors ENTRY_PATHS in
// web/vite.config.js so dev and release agree.
const ENTRY_PATHS = ['/', '/launcher.html', '/royal-angel', '/royal-angel.html']

const app = express()
app.disable('x-powered-by')
// Exactly one proxy sits in front (Vite in the sandbox, Caddy in a release), which is
// what makes the per-IP limits use the real caller instead of the proxy's address.
app.set('trust proxy', 1)

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('Referrer-Policy', 'no-referrer')
  res.set('X-Permitted-Cross-Domain-Policies', 'none')
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})

// 3mb leaves room for the cropped avatar data URL from the profile screen and for a
// downscaled picture sent with a message.
app.use(express.json({ limit: '3mb' }))
// Backstop for anything the per-route limits do not cover.
app.use('/api', limiter('api', 1200, 60_000))
app.use('/api/auth', authRoutes)
app.use('/api', profileRoutes)
app.use('/api', flairRoutes)
app.use('/api', casinoRoutes)
app.use('/api', leaderboardRoutes)
app.use('/api', chatRoutes)

// A release build serves the built site from this same origin (see Dockerfile).
// The sandbox preview leaves this off and Vite serves the source instead.
if (process.env.SERVE_WEB === '1') {
  // Every front door renders the app in place, no redirect (the client moves the address
  // bar to /chat). Registered before express.static so the launcher file on disk never wins.
  app.get(ENTRY_PATHS, (_req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')))
  app.use(express.static(WEB_DIR, { index: false }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
    // Everything else (including /chat) renders the room.
    res.sendFile(path.join(WEB_DIR, 'index.html'))
  })
}

// eslint-disable-next-line no-unused-vars
app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That payload is too large.' })
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'That request could not be read.' })
  }
  console.error('request failed', error)
  res.status(500).json({ error: 'Something went wrong on our end.' })
})

const server = http.createServer(app)
initRealtime(server)

async function start() {
  await waitForDb()
  await migrate()
  await seed()
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`only-chatz api listening on :${PORT}`)
  })
}

start().catch(error => {
  console.error('api failed to start', error)
  process.exit(1)
})

// Vercel's express service loads this module as a function and needs the server
// (Socket.IO's upgrade handler rides on it). Docker keeps using the listener above.
export default server
