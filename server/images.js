// Pictures arrive as `data:image/...;base64,…` URLs (an avatar cropped in settings, or a
// downscaled file sent with a message), so no file storage or multipart parsing is needed.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Trust the bytes, not the label the client put in front of them. */
export function isRealImage(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const head = Buffer.from(base64.slice(0, 32), 'base64')
  if (head.subarray(0, 8).equals(PNG_SIGNATURE)) return true
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true
  return head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP'
}
