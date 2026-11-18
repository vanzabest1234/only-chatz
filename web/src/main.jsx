import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AutoUpdate from './components/AutoUpdate'
import './styles/base.css'
import './styles/app.css'
import './styles/console.css'

// The room is the front door: `/` renders this app directly, and the address bar is pointed
// at /chat from the client — a server redirect on the root document reads as a routing
// failure in some hosts. The query string (a preview's access token) is kept.
// Only the release build does this. The sandbox preview is a Vite dev server whose host
// only resolves documents on the path it served, so rewriting the address bar there leaves
// the pane asking for /chat and answering "not found".
// The single-file build (web/scripts/single-file.mjs) is opened under its own name, so it
// keeps the address bar it was loaded from.
const singleFile = import.meta.env.VITE_SINGLE_FILE === '1'
if (!import.meta.env.DEV && !singleFile && window.location.pathname !== '/chat') {
  window.history.replaceState(null, '', `/chat${window.location.search}${window.location.hash}`)
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <AutoUpdate />
  </React.StrictMode>,
)
