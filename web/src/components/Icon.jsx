const PATHS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  users:
    'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm11 9v-1a4 4 0 0 0-3-3.87M16.5 3.13a4 4 0 0 1 0 7.75',
  send: 'M4 12 20 4l-8 16-2-6-6-2Z',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 13 4 4L19 7',
  logout: 'M15 12H3m4-4-4 4 4 4M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5',
  close: 'M6 6l12 12M18 6 6 18',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0',
  image: 'M4 5h16v14H4zM4 15l4.5-4.5 3 3L15 9l5 5M9 9.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  heart:
    'M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 14s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01',
  play: 'M8 5.5v13l10.5-6.5Z',
  pulse: 'M3 12h3.5l2.5-7 4 14 2.5-7H21',
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
