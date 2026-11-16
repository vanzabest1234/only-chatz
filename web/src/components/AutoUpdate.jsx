import { useEffect, useState } from 'react'
import { watchBuild } from '../lib/version'

// Sits outside App so it runs on the sign-in screen too. A short note, then a reload onto the
// build the API is serving now.
const RELOAD_DELAY_MS = 1200

export default function AutoUpdate() {
  const [fresh, setFresh] = useState(false)

  useEffect(() => {
    if (fresh) return undefined
    return watchBuild(() => setFresh(true))
  }, [fresh])

  useEffect(() => {
    if (!fresh) return undefined
    const timer = window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [fresh])

  if (!fresh) return null
  return (
    <p className="toast auto-update" role="status">
      new version — reloading…
    </p>
  )
}
