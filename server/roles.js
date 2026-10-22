export const RANKS = {
  member: 0,
  mod: 1,
  admin: 2,
  'co-owner': 3,
  owner: 4,
}

export const ROLE_LABELS = {
  member: 'Member',
  mod: 'Mod',
  admin: 'Admin',
  'co-owner': 'Co-Owner',
  owner: 'Owner',
}

export const ASSIGNABLE_ROLES = ['member', 'mod', 'admin', 'co-owner']

export const rankOf = role => RANKS[role] ?? 0

export const labelFor = role => ROLE_LABELS[role] ?? 'Member'

export function roleForRank(rank) {
  const match = Object.entries(RANKS).find(([, value]) => value === rank)
  return match ? labelFor(match[0]) : 'Member'
}
