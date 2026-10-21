import http from 'node:http'
import express from 'express'

import { migrate, waitForDb } from './db.js'
import { initRealtime } from './realtime.js'
import { seed } from './seed.js'
import authRoutes from './routes/auth.js'
import chatRoutes from './routes/chat.js'
import profileRoutes from './routes/profile.js'

const PORT = Number(process.env.PORT ?? 8000)

const app = express()
// 1mb leaves room for the cropped avatar data URL sent by the profile screen.
app.use(express.json({ limit: '1mb' }))
app.use('/api/auth', authRoutes)
app.use('/api', profileRoutes)
app.use('/api', chatRoutes)

// eslint-disable-next-line no-unused-vars
app.use((error, _req, res, _next) => {
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
