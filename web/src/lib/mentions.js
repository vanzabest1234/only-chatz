// "@name" is how people call each other here: split a message so the mentions can be
// painted, and mark the ones aimed at the person reading.
const MENTION = /@([a-z0-9_]{2,32})/gi

export function splitMentions(text, username) {
  const body = String(text ?? '')
  const mine = String(username ?? '').toLowerCase()
  const parts = []
  let last = 0

  for (const hit of body.matchAll(MENTION)) {
    const start = hit.index ?? 0
    if (start > last) parts.push({ text: body.slice(last, start), mention: false })
    parts.push({ text: hit[0], mention: true, mine: hit[1].toLowerCase() === mine })
    last = start + hit[0].length
  }
  if (last < body.length) parts.push({ text: body.slice(last), mention: false })
  return parts
}

/** A short two-note chime so a ping is heard, not just seen. Browsers may refuse it. */
export function playPing() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    ;[0, 0.14].forEach((offset, index) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = index === 0 ? 880 : 1174
      gain.gain.setValueAtTime(0.0001, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.14, now + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.13)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.16)
    })
    setTimeout(() => ctx.close().catch(() => {}), 600)
  } catch {
    /* silence is fine — the toast still shows */
  }
}
