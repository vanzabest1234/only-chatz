// The launcher's ways into the room. They all open the same app at /chat; only the frame it
// lives in differs. The URL is absolute on purpose — an about:blank document has no base of
// its own — and keeps this page's query string, so a preview's access token travels along.
// Kept in its own file so the page needs no inline script.
const ROOM = new URL('/chat', window.location.origin)
ROOM.search = window.location.search
const roomUrl = ROOM.href

const hint = document.getElementById('hint')

function say(text, bad) {
  hint.textContent = text
  hint.classList.toggle('bad', Boolean(bad))
}

// A blank tab with the room dropped into it as a full-bleed frame: the address bar stays
// about:blank. about:blank inherits this page's origin, so the room keeps the signed-in
// session. Nothing is written until the tab actually exists.
document.getElementById('blank').addEventListener('click', () => {
  const blank = window.open('', '_blank')
  if (!blank) {
    say('the browser blocked the blank tab — allow pop-ups for this site and try again.', true)
    return
  }
  blank.document.write(
    '<!doctype html><html><head><meta charset="utf-8" />' +
      '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
      '<title>only chatz</title>' +
      '<style>html,body{margin:0;height:100%;background:#2e3339}iframe{display:block;width:100%;height:100%;border:0}</style>' +
      '</head><body><iframe src="' +
      roomUrl +
      '" allow="microphone; clipboard-write"></iframe></body></html>',
  )
  blank.document.close()
  const framed = Boolean(blank.document.querySelector('iframe'))
  say(
    framed
      ? 'the room is open in a blank tab.'
      : 'the blank tab opened without the room — use the iframe choice instead.',
    !framed,
  )
})

// The same room, framed inside this page, with a way back out. Staying on this page is
// what keeps the room reachable in a preview host that only answers its own address.
function openRoom() {
  if (document.querySelector('.stage')) return

  const stage = document.createElement('iframe')
  stage.className = 'stage'
  stage.src = roomUrl
  stage.title = 'only chatz'
  // Voice channels need the microphone: a frame only gets it when it asks for it.
  stage.allow = 'microphone; clipboard-write'

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'close'
  close.textContent = '×'
  close.setAttribute('aria-label', 'close the room')
  close.addEventListener('click', () => {
    stage.remove()
    close.remove()
    document.body.classList.remove('staged')
    say('back to the two choices.')
  })

  document.body.append(stage, close)
  document.body.classList.add('staged')
}

document.getElementById('frame').addEventListener('click', openRoom)

// "just open the room" opens it here too instead of navigating away — a full-page hop to
// /chat is refused by the preview host, which only serves the path it handed the pane.
document.querySelector('.foot a').addEventListener('click', event => {
  event.preventDefault()
  openRoom()
})
