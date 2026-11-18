import { io } from 'socket.io-client'
import { baseUrl, getToken } from './api'

export const socket = io({
  autoConnect: false,
  auth: { token: null },
})

// A copy of only-chatz.html opened outside the room names its room on the sign-in screen, and
// that address is only known after the module above has been created. Point the connection at
// it before it opens — a copy served by the room keeps the relative default.
export function pointAtRoom() {
  const room = baseUrl()
  if (room && socket.io.uri !== room) socket.io.uri = room
}

// Phones sleep and laptops hop between wifi networks. The transport notices on its own
// eventually, but not before its reconnect backoff; nudge it the moment the browser says the
// network is back, so a room keeps working after a switch instead of sitting dead until a
// reload. Only a signed-in visitor reconnects — an anonymous handshake would just be refused.
function wake() {
  if (!socket.connected && getToken()) socket.connect()
}

if (typeof window !== 'undefined') window.addEventListener('online', wake)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake()
  })
}

// Closing or reloading the tab should close the socket politely. A websocket torn out from
// under the dev proxy surfaces as `ws proxy socket error: read ECONNRESET` on every reload.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (socket.connected) socket.disconnect()
  })
}
