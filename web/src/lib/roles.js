export const RANKS = { member: 0, mod: 1, admin: 2, 'co-owner': 3, owner: 4 }

export const ROLE_LABELS = {
  member: 'Member',
  mod: 'Mod',
  admin: 'Admin',
  'co-owner': 'Co-Owner',
  owner: 'Owner',
}

export const roleRank = role => RANKS[role] ?? 0

export const roleLabel = role => ROLE_LABELS[role] ?? 'Member'
