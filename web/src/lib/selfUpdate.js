// A copy of only-chatz.html opened from disk carries its own frozen bundle: reloading it puts the
// same old file back on screen, so the build poll's "reloading…" could never bring a saved copy a
// new chat. The file is stamped with the build it was made from (`data-build`, written by
// web/scripts/single-file.mjs) and the room keeps serving a fresh /only-chatz.html, so the copy
// compares the two — when it opens, and again whenever the room's build moves — and swaps the
// room's version into the same tab, keeping the address and the saved session.
import { baseUrl } from '../api'

const singleFile = import.meta.env.VITE_SINGLE_FILE === '1'

export function ownBuild() {
  return document.documentElement.dataset.build || ''
}

// Served by the room itself, a plain reload already fetches the new build, and a copy without a
// stamp (one downloaded before the stamp existed) cannot tell whether it is behind.
export function standaloneCopy() {
  return singleFile && Boolean(ownBuild()) && Boolean(baseUrl())
}

// The room's file, fetched but not yet swapped in. Kept between the open-time check and the swap
// so the file travels once.
let pending = null

// Fetches the room's one-file build when it is newer than this copy. Returns the room's build
// stamp when there is something to apply, and '' when the copy is current or the room is out of
// reach (offline, room down) — the copy simply keeps running its own bundle.
export async function fetchRoomFile() {
  if (pending) return pending.build
  const room = baseUrl()
  if (!room) return ''
  let html
  try {
    const response = await fetch(`${room}/only-chatz.html`, { cache: 'no-store' })
    if (!response.ok) return ''
    html = await response.text()
  } catch {
    return ''
  }
  const build = html.match(/data-build="([^"]*)"/)?.[1] || ''
  if (!build || build === ownBuild()) return ''
  pending = { room, html }
  return build
}

// Replaces this document with the room's copy. Function replacements only: the bundle is minified
// code that a string replacement would expand `$&` / `$'` inside (see web/scripts/single-file.mjs).
export function applyRoomFile() {
  if (!pending) return false
  const { room, html } = pending
  pending = null
  // The room stamps its own address on the way out, but only a referer tells it which address the
  // download came from; this copy already knows its room, so write that back.
  const stamped = html.replace(/data-room="[^"]*"/, () => `data-room="${room}"`)
  // The same courtesy as closing the tab, so the running app drops its socket instead of leaving
  // it behind the document it belonged to.
  window.dispatchEvent(new Event('pagehide'))
  document.open()
  document.write(stamped)
  document.close()
  return true
}
