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

const PORT = Number(process.env.PORT ?? 8000)
const WEB_DIR = process.env.WEB_DIR || fileURLToPath(new URL('../web/dist', import.meta.url))

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

// 1mb leaves room for the cropped avatar data URL sent by the profile screen.
app.use(express.json({ limit: '1mb' }))
// Backstop for anything the per-route limits do not cover.
app.use('/api', limiter('api', 1200, 60_000))
app.use('/api/auth', authRoutes)
app.use('/api', profileRoutes)
app.use('/api', flairRoutes)
app.use('/api', chatRoutes)

// A release build serves the built site from this same origin (see Dockerfile).
// The sandbox preview leaves this off and Vite serves the source instead.
if (process.env.SERVE_WEB === '1') {
  app.use(express.static(WEB_DIR, { index: false }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
    // `/` is the launcher; every other path (including /chat) is the room.
    res.sendFile(path.join(WEB_DIR, req.path === '/' ? 'launcher.html' : 'index.html'))
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
