import { io } from 'socket.io-client'
import { getToken } from './api'

export const socket = io({
  autoConnect: false,
  auth: { token: null },
})

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
