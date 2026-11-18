// The chat keeps itself current: every open tab polls the build fingerprint and reloads when
// new code lands, so a friend on a tunnel sees an edit without pressing refresh.
import { baseUrl } from '../api'

const POLL_MS = 6000

export function watchBuild(onChange) {
  let baseline = null
  let stopped = false

  const check = async () => {
    let build
    try {
      const response = await fetch(`${baseUrl()}/api/version`, { cache: 'no-store' })
      if (!response.ok) return
      build = (await response.json()).build
    } catch {
      // The API is restarting (node --watch) or the network blinked; the next poll retries.
      return
    }
    if (stopped || !build) return
    if (baseline && build !== baseline) {
      stopped = true
      onChange()
      return
    }
    baseline = build
  }

  check()
  const timer = window.setInterval(() => {
    if (!stopped) check()
  }, POLL_MS)

  // A backgrounded tab has its timers throttled, so it can come back minutes behind. Check the
  // moment it is visible again instead of waiting out the next poll with old code on screen.
  const onVisible = () => {
    if (!stopped && document.visibilityState === 'visible') check()
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)

  return () => {
    stopped = true
    window.clearInterval(timer)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }
}
