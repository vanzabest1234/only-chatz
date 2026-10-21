const PATHS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  users:
    'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm11 9v-1a4 4 0 0 0-3-3.87M16.5 3.13a4 4 0 0 1 0 7.75',
  send: 'M4 12 20 4l-8 16-2-6-6-2Z',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 13 4 4L19 7',
  logout: 'M15 12H3m4-4-4 4 4 4M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5',
  close: 'M6 6l12 12M18 6 6 18',
}

export default function Icon({ name, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
