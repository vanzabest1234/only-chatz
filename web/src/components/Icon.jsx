const PATHS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  users:
    'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm11 9v-1a4 4 0 0 0-3-3.87M16.5 3.13a4 4 0 0 1 0 7.75',
  send: 'M4 12 20 4l-8 16-2-6-6-2Z',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v10M14.4 9.4c0-1-1.1-1.7-2.4-1.7s-2.4.7-2.4 1.7 1.1 1.6 2.4 1.6 2.4.7 2.4 1.7-1.1 1.7-2.4 1.7-2.4-.7-2.4-1.7',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 13 4 4L19 7',
  logout: 'M15 12H3m4-4-4 4 4 4M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5',
  close: 'M6 6l12 12M18 6 6 18',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0',
  image: 'M4 5h16v14H4zM4 15l4.5-4.5 3 3L15 9l5 5M9 9.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z',
  mic: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3M9 21h6',
  micOff:
    'M15 10.5V6a3 3 0 0 0-5.7-1.3M9 9.2V11a3 3 0 0 0 4.6 2.6M5 11a7 7 0 0 0 10.9 5.9M12 18v3M9 21h6M4 4l16 16',
  headphones:
    'M4 16v-4a8 8 0 0 1 16 0v4M4 16a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2Zm16 0a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2Z',
  headphonesOff:
    'M4 16v-4a8 8 0 0 1 13.6-5.7M20 12v4a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2ZM4 16a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2ZM4 4l16 16',
  speaker: 'M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4',
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
