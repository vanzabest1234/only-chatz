// The chat keeps itself current: every open tab polls the build fingerprint and reloads when
// new code lands, so a friend on a tunnel sees an edit without pressing refresh.
const POLL_MS = 6000

export function watchBuild(onChange) {
  let baseline = null
  let stopped = false

  const check = async () => {
    let build
    try {
      const response = await fetch('/api/version', { cache: 'no-store' })
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

  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}
