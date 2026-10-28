import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/base.css'
import './styles/app.css'
import './styles/console.css'

// The room is the front door: `/` and the old launcher paths render this app, and the
// address bar is pointed at /chat from the client — a server redirect on the root document
// reads as a routing failure in some hosts. The query string (a preview's access token)
// is kept.
if (window.location.pathname !== '/chat') {
  window.history.replaceState(null, '', `/chat${window.location.search}${window.location.hash}`)
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
