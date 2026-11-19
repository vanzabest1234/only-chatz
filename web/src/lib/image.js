// Pictures are sent as data URLs (like avatars), so the browser shrinks the file first:
// a phone photo becomes a few hundred KB instead of several MB.
const MAX_EDGE = 1280
const QUALITY = 0.82

/** Read a picked file and hand back a downscaled JPEG data URL the API will accept. */
export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Only pictures can be sent.'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('That picture could not be read.'))
    reader.onload = () => {
      const picture = new Image()
      picture.onerror = () => reject(new Error('That picture could not be read.'))
      picture.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(picture.width, picture.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(picture.width * scale))
        canvas.height = Math.max(1, Math.round(picture.height * scale))
        const context = canvas.getContext('2d')
        // JPEG has no transparency; the room is dark, so transparent pixels land on the void.
        context.fillStyle = '#0a0f14'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(picture, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', QUALITY))
      }
      picture.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
