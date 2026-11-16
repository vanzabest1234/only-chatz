import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// A fingerprint of the code this process was started from. The client polls it through
// `GET /api/version` and reloads itself when the number moves, so an edit reaches every open
// tab without anyone pressing refresh. It is deliberately cheap: file count, summed size and
// the newest modification time of the same files, cached for a second.
const SERVER_DIR = fileURLToPath(new URL('.', import.meta.url))
const WEB_SRC = fileURLToPath(new URL('../web/src', import.meta.url))
const WEB_DIST = fileURLToPath(new URL('../web/dist', import.meta.url))
const WEB_PUBLIC = fileURLToPath(new URL('../web/public', import.meta.url))
const WEB_INDEX = fileURLToPath(new URL('../web/index.html', import.meta.url))

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage'])
const WATCHED_EXTENSIONS = new Set(['.js', '.jsx', '.css', '.html', '.json', '.sql', '.svg'])

function walk(dir, seen) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, seen)
      continue
    }
    if (!WATCHED_EXTENSIONS.has(path.extname(entry.name))) continue
    try {
      const stat = statSync(full)
      seen.count += 1
      seen.bytes += stat.size
      if (stat.mtimeMs > seen.newest) seen.newest = stat.mtimeMs
    } catch {
      // A file removed mid-scan just does not count this round.
    }
  }
}

const CACHE_MS = 1000
let cached = { at: 0, build: '' }

export function sourceBuild() {
  const now = Date.now()
  if (cached.build && now - cached.at < CACHE_MS) return cached.build

  const seen = { count: 0, bytes: 0, newest: 0 }
  // The API's own code plus the client source in the sandbox (Vite serves web/src), and the
  // built site in a release (only web/dist exists inside that image).
  walk(SERVER_DIR, seen)
  walk(WEB_SRC, seen)
  walk(WEB_PUBLIC, seen)
  walk(WEB_DIST, seen)
  try {
    const stat = statSync(WEB_INDEX)
    seen.count += 1
    seen.bytes += stat.size
    if (stat.mtimeMs > seen.newest) seen.newest = stat.mtimeMs
  } catch {
    // Release images do not ship web/index.html.
  }

  cached = { at: now, build: `${seen.count}-${seen.bytes}-${Math.round(seen.newest)}` }
  return cached.build
}
