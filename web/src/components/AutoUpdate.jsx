import { useEffect, useState } from 'react'
import { watchBuild } from '../lib/version'
import { applyRoomFile, fetchRoomFile, standaloneCopy } from '../lib/selfUpdate'

// Sits outside App so it runs on the sign-in screen too. A short note, then a reload onto the
// build the API is serving now — or, for a copy saved to disk, the room's own file swapped in.
const RELOAD_DELAY_MS = 1200

export default function AutoUpdate() {
  const [fresh, setFresh] = useState(false)
  // A saved copy is behind from the moment it opens, so it asks the room straight away instead of
  // waiting for a change to happen while it is open.
  const [standalone] = useState(standaloneCopy)

  useEffect(() => {
    if (!standalone) return undefined
    let alive = true
    fetchRoomFile().then(build => {
      if (alive && build) setFresh(true)
    })
    return () => {
      alive = false
    }
  }, [standalone])

  useEffect(() => {
    if (fresh) return undefined
    return watchBuild(() => setFresh(true))
  }, [fresh])

  useEffect(() => {
    if (!fresh) return undefined
    let cancelled = false
    const timer = window.setTimeout(async () => {
      if (standalone) {
        // Already fetched when the open-time check found it; a change detected while open fetches
        // it now.
        await fetchRoomFile()
        if (!cancelled && applyRoomFile()) return
      }
      if (!cancelled) window.location.reload()
    }, RELOAD_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [fresh, standalone])

  if (!fresh) return null
  return (
    <p className="toast auto-update" role="status">
      {standalone ? 'new version — updating…' : 'new version — reloading…'}
    </p>
  )
}
