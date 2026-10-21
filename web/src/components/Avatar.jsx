import { initials } from '../lib/format'

export default function Avatar({ name, color = '#93a0c9', size = 38, online = null }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), backgroundColor: color }}
      aria-hidden="true"
    >
      {initials(name)}
      {online !== null && <span className={`avatar-dot ${online ? 'is-on' : 'is-off'}`} />}
    </span>
  )
}
