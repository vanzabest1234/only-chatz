import { useEffect, useRef, useState } from 'react'

/**
 * The browser half of voice. One microphone stream, one RTCPeerConnection per person in
 * the room, and the existing socket carrying only offers, answers and ICE candidates —
 * audio travels straight between browsers. No media server, no hosted STUN/TURN, no
 * account: the room works on a plain LAN or a directly reachable host, and only people
 * the server has put in the same room can be called.
 *
 * The newcomer calls everyone already there and the room answers, so a room of N people
 * costs each browser N-1 connections and nothing more.
 */
const SPEAKING_LEVEL = 0.035
const SPEAKING_HOLD = 320
// How long a join waits for the microphone permission before falling back to listening.
const MIC_WAIT = 4000

/**
 * Some hosts embed the room in a frame that never delegates the microphone. Requesting it
 * there leaves the permission promise hanging (no prompt can appear), which would make the
 * join click do nothing forever — so the frame's own policy is asked first, and a refused
 * frame joins listening only.
 */
function frameAllowsMic() {
  const policy = document.permissionsPolicy ?? document.featurePolicy
  try {
    return policy?.allowsFeature ? policy.allowsFeature('microphone') : true
  } catch {
    return true
  }
}

/** The microphone, or null when it is unavailable, refused, or slow to answer. */
function askForMic() {
  try {
    if (!frameAllowsMic()) return Promise.resolve(null)
    const request = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    let timer
    const fallback = new Promise(resolve => {
      timer = setTimeout(() => resolve(null), MIC_WAIT)
    })
    return Promise.race([request, fallback]).then(
      stream => {
        clearTimeout(timer)
        if (!stream) request.then(late => late.getTracks().forEach(track => track.stop())).catch(() => {})
        return stream
      },
      () => {
        clearTimeout(timer)
        return null
      },
    )
  } catch {
    return Promise.resolve(null)
  }
}

export function useVoice(socket, meId) {
  const [rooms, setRooms] = useState({})
  const [channelId, setChannelId] = useState(null)
  const [roster, setRoster] = useState([])
  const [speaking, setSpeaking] = useState([])
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [hasMic, setHasMic] = useState(false)
  const [micError, setMicError] = useState('')
  const [error, setError] = useState('')

  // Everything the async callbacks read lives in refs: the socket handlers are attached
  // once and must never act on a stale render.
  const live = useRef({ channelId: null, muted: false, deafened: false })
  const local = useRef(null)
  const peers = useRef(new Map())
  const context = useRef(null)
  const levels = useRef(new Map())
  const heard = useRef(new Set())
  const frame = useRef(0)
  // A room picked before the socket finished its handshake waits here instead of failing.
  const pending = useRef(null)

  /** Measure one stream and remember when it was last above the threshold. */
  const watchLevel = (userId, stream) => {
    const ctx = context.current
    if (!ctx || !stream) return
    try {
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      levels.current.set(userId, { analyser, at: 0 })
    } catch {
      // A browser that will not hand over the stream still plays it; it just cannot glow.
    }
  }

  const stopLoop = () => {
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = 0
  }

  const startLoop = () => {
    if (frame.current || typeof requestAnimationFrame === 'undefined') return
    const sweep = () => {
      const now = performance.now()
      const next = new Set()
      for (const [userId, entry] of levels.current) {
        const data = new Uint8Array(entry.analyser.fftSize)
        entry.analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i += 1) {
          const value = (data[i] - 128) / 128
          sum += value * value
        }
        if (Math.sqrt(sum / data.length) > SPEAKING_LEVEL) entry.at = now
        if (now - entry.at < SPEAKING_HOLD) next.add(userId)
      }
      // Only repaint when the set of voices actually changes.
      const previous = heard.current
      if (next.size !== previous.size || [...next].some(id => !previous.has(id))) {
        heard.current = next
        setSpeaking([...next])
      }
      frame.current = requestAnimationFrame(sweep)
    }
    frame.current = requestAnimationFrame(sweep)
  }

  const closePeer = userId => {
    const entry = peers.current.get(userId)
    if (!entry) return
    peers.current.delete(userId)
    levels.current.delete(userId)
    entry.pc.onicecandidate = null
    entry.pc.ontrack = null
    entry.pc.onconnectionstatechange = null
    try {
      entry.pc.close()
    } catch {
      // already closed
    }
    entry.audio?.remove()
  }

  const ensurePeer = (userId, initiate) => {
    const existing = peers.current.get(userId)
    if (existing) return existing

    const pc = new RTCPeerConnection({ iceServers: [] })
    const entry = { pc, audio: null, pending: [] }
    peers.current.set(userId, entry)

    const stream = local.current
    if (stream) stream.getTracks().forEach(track => pc.addTrack(track, stream))
    // Listening without a microphone still needs a line to receive on.
    else pc.addTransceiver('audio', { direction: 'recvonly' })

    pc.onicecandidate = event => {
      if (!event.candidate) return
      socket.emit('voice:signal', { to: userId, data: { candidate: event.candidate } })
    }

    pc.ontrack = event => {
      const [remote] = event.streams
      if (!remote) return
      const audio = entry.audio ?? document.createElement('audio')
      audio.autoplay = true
      audio.playsInline = true
      audio.muted = live.current.deafened
      audio.srcObject = remote
      if (!audio.parentNode) {
        audio.style.display = 'none'
        document.body.appendChild(audio)
      }
      audio.play?.().catch(() => {})
      entry.audio = audio
      watchLevel(userId, remote)
    }

    if (initiate) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() =>
          socket.emit('voice:signal', {
            to: userId,
            data: { description: pc.localDescription },
          }),
        )
        .catch(() => {})
    }

    return entry
  }

  const onSignal = async payload => {
    const from = Number(payload?.from)
    const data = payload?.data
    if (!Number.isInteger(from) || !data) return

    const entry = ensurePeer(from, false)
    const { pc } = entry
    try {
      if (data.description) {
        await pc.setRemoteDescription(data.description)
        entry.pending.splice(0).forEach(candidate => pc.addIceCandidate(candidate).catch(() => {}))
        if (data.description.type === 'offer') {
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit('voice:signal', {
            to: from,
            data: { description: pc.localDescription },
          })
        }
      } else if (data.candidate) {
        // A candidate can land before the offer it belongs to; hold it until then.
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate)
        else entry.pending.push(data.candidate)
      }
    } catch {
      closePeer(from)
    }
  }

  const teardown = (withState = true) => {
    live.current = { channelId: null, muted: false, deafened: false }
    pending.current = null
    stopLoop()
    for (const userId of [...peers.current.keys()]) closePeer(userId)
    peers.current.clear()
    levels.current.clear()
    heard.current = new Set()

    if (local.current) {
      local.current.getTracks().forEach(track => track.stop())
      local.current = null
    }
    if (context.current) {
      context.current.close?.().catch(() => {})
      context.current = null
    }

    if (!withState) return
    setChannelId(null)
    setRoster([])
    setSpeaking([])
    setMuted(false)
    setDeafened(false)
    setHasMic(false)
    setMicError('')
  }

  const join = async target => {
    // A click during the first handshake is not a failure: remember the room and walk in
    // as soon as the socket is up.
    if (!socket.connected) {
      pending.current = target
      setError('')
      socket.connect()
      return
    }
    if (live.current.channelId === target) return
    pending.current = null
    setError('')
    setMicError('')

    if (live.current.channelId !== null) {
      socket.emit('voice:leave')
      teardown()
    }

    // The click is the gesture browsers want before audio may start.
    if (!context.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (Ctx) {
        context.current = new Ctx()
        context.current.resume?.().catch(() => {})
      }
    }

    // A permission prompt can sit unanswered (or be blocked by an embedding page). Wait a
    // few seconds, then walk in listening only rather than leave the click doing nothing.
    local.current = await askForMic()

    if (local.current) {
      setHasMic(true)
      if (meId !== null && meId !== undefined) watchLevel(meId, local.current)
    } else {
      setMicError('No microphone — you are listening only.')
    }

    startLoop()
    socket.emit('voice:join', { channelId: target })
  }

  const leave = () => {
    if (live.current.channelId !== null) socket.emit('voice:leave')
    teardown()
  }

  const toggleMute = () => {
    if (!local.current) {
      setMicError('No microphone to mute.')
      return
    }
    const next = !live.current.muted
    live.current.muted = next
    local.current.getAudioTracks().forEach(track => {
      track.enabled = !next
    })
    setMuted(next)
    socket.emit('voice:state', { muted: next, deafened: live.current.deafened })
  }

  const toggleDeafen = () => {
    const next = !live.current.deafened
    live.current.deafened = next
    for (const entry of peers.current.values()) {
      if (entry.audio) entry.audio.muted = next
    }
    setDeafened(next)
    socket.emit('voice:state', { muted: live.current.muted, deafened: next })
  }

  useEffect(() => {
    const handlers = {
      'voice:update': payload => {
        const snapshot = payload && typeof payload === 'object' ? payload : {}
        setRooms(snapshot)
        // The server's roster is the truth; it also carries everyone's mute state.
        const current = live.current.channelId
        if (current !== null && snapshot[current]) setRoster(snapshot[current])
      },
      'voice:joined': payload => {
        if (!payload?.channelId) return
        live.current.channelId = payload.channelId
        setChannelId(payload.channelId)
        setRoster([payload.me, ...(payload.peers ?? [])].filter(Boolean))
        socket.emit('voice:state', {
          muted: live.current.muted,
          deafened: live.current.deafened,
        })
        ;(payload.peers ?? []).forEach(peer => ensurePeer(peer.userId, true))
      },
      'voice:peer-join': person => {
        if (!person?.userId) return
        setRoster(previous =>
          previous.some(item => item.userId === person.userId) ? previous : [...previous, person],
        )
      },
      'voice:peer-leave': payload => {
        const userId = Number(payload?.userId)
        if (!Number.isInteger(userId)) return
        closePeer(userId)
        setRoster(previous => previous.filter(item => item.userId !== userId))
      },
      'voice:peer-state': person => {
        if (!person?.userId) return
        setRoster(previous =>
          previous.map(item => (item.userId === person.userId ? { ...item, ...person } : item)),
        )
      },
      'voice:signal': payload => {
        onSignal(payload)
      },
      'voice:left': payload => {
        if (payload?.channelId === live.current.channelId) teardown()
      },
      'voice:error': payload => {
        teardown()
        setError(payload?.error || 'Voice is unavailable right now.')
      },
      connect: () => {
        socket.emit('voice:sync')
        const queued = pending.current
        if (queued !== null) {
          pending.current = null
          join(queued)
        }
      },
      disconnect: () => {
        if (live.current.channelId === null) return
        teardown()
        setError('Lost the voice connection — join again.')
      },
    }

    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler))
    if (socket.connected) socket.emit('voice:sync')
    return () => {
      Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

  useEffect(() => () => teardown(false), []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    rooms,
    channelId,
    roster,
    speaking,
    muted,
    deafened,
    hasMic,
    micError,
    error,
    join,
    leave,
    toggleMute,
    toggleDeafen,
  }
}
