// Display-only flair data: the colours and the labels the UI paints with.
// Odds and the wheel's slices always come from the API, so nothing here can change a roll.
export const FLAIR_COLORS = {
  electric: '#7df9ff',
  princess: '#ff9ed2',
  prince: '#9db4ff',
  famous: '#ffd166',
  lucky: '#8ef58a',
  angel: '#e8f4ff',
  savior: '#7dffd8',
  devil: '#ff6b6b',
  vip: '#dbe6ef',
  mvp: '#ffc44d',
  bread: '#e0b074',
}

export const FLAIR_LABELS = {
  electric: 'Electric',
  princess: 'Princess',
  prince: 'Prince',
  famous: 'Famous',
  lucky: 'Lucky',
  angel: 'Angel',
  savior: 'Savior',
  devil: 'Devil',
  vip: 'VIP',
  mvp: 'MVP',
  bread: 'bread',
}

export const flairColor = key => FLAIR_COLORS[key] ?? '#74f0a6'

export const flairLabel = key => FLAIR_LABELS[key] ?? key
