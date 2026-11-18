// Folds the whole room into one file: web/public/only-chatz.html.
//
// `npm run dev` runs this first (package.json "predev"), so every boot of the web server
// rebuilds the file from the current source; `npm run single` does it on demand. The build is
// a normal Vite build into dist-single (see vite.single.config.js), and its bundle and
// stylesheet are pasted straight into the document, favicon included, so the result needs no
// neighbouring files. Relative API paths mean it works when served by the room itself
// (/only-chatz.html); opened from disk it renders the sign-in screen.
//
// A failure here is reported and skipped — the dev server must still start.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
// Built outside web/ on purpose: the dev server watches this directory, so a build written
// here would reload the room on every boot.
const OUT = path.join(os.tmpdir(), 'only-chatz-single')
const TARGET = path.join(ROOT, 'public', 'only-chatz.html')

const escape = (code, tag) => code.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`)
const read = (ref, base) => readFileSync(path.join(base, ref.replace(/^\.?\//, '')), 'utf8')

function build() {
  const vite = path.join(ROOT, 'node_modules', '.bin', 'vite')
  execFileSync(
    vite,
    ['build', '--config', 'vite.single.config.js', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'warn'],
    { cwd: ROOT, stdio: 'inherit' },
  )

  let html = readFileSync(path.join(OUT, 'index.html'), 'utf8')

  // Whichever room serves this file stamps its own address over the placeholder, so a copy
  // saved to disk signs in without being asked where the room is (web/vite.config.js in dev,
  // server/index.js in a release). Left as the placeholder — a copy taken straight from the
  // repo — the app still asks for the address.
  html = html.replace('<html', '<html data-room="__CHATZ_ROOM__"')

  // The entry chunk becomes an inline classic script placed at the end of the body: a classic
  // script runs the moment it is parsed, so the app needs #root to already be in the document.
  let entry = ''
  html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/g, (_tag, src) => {
    entry += escape(read(src, OUT), 'script')
    return ''
  })

  // The one stylesheet is inlined; any leftover preload link has nothing left to fetch.
  html = html.replace(/<link\b[^>]*>/g, tag => {
    const href = tag.match(/\bhref="([^"]+)"/)?.[1]
    if (!href || !/\.(js|css)$/.test(href)) return tag
    if (href.endsWith('.css')) return `<style>\n${escape(read(href, OUT), 'style')}\n</style>`
    return ''
  })

  // A *function* replacement: the bundle is minified code full of `$&` / `$'` sequences, and a
  // string replacement lets String.replace expand them — which pasted the matched `</body>` into
  // the middle of the script and broke the whole build with "Unexpected token '<'".
  if (entry) html = html.replace('</body>', () => `  <script>\n${entry}\n  </script>\n  </body>`)

  // The tab icon travels with the file instead of pointing at a path that may not exist.
  const icon = path.join(ROOT, 'public', 'favicon.svg')
  if (existsSync(icon)) {
    const data = `data:image/svg+xml,${encodeURIComponent(readFileSync(icon, 'utf8'))}`
    html = html.replace('href="./favicon.svg"', `href="${data}"`).replace('href="/favicon.svg"', `href="${data}"`)
  }

  return html
}

try {
  const html = build()
  const previous = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : ''
  // Only touch the file when it actually changed, so a boot does not churn the repo.
  if (html !== previous) {
    writeFileSync(TARGET, html)
    console.log(`[single] only-chatz.html rebuilt from source (${Math.round(html.length / 1024)} kB)`)
  } else {
    console.log('[single] only-chatz.html is already up to date')
  }
} catch (problem) {
  console.warn(`[single] could not rebuild only-chatz.html: ${problem.message}`)
} finally {
  rmSync(OUT, { recursive: true, force: true })
}
