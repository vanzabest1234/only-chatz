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

/** The profile banner strips, one per role theme. Everyone may pick any of them. */
export const BANNERS = ['member', 'mod', 'admin', 'co-owner', 'owner']

export const rankOf = role => RANKS[role] ?? 0

/**
 * Rooms are structural, so making or renaming one needs a staff rank: admins and above.
 * One rule for every channel kind — the voice rooms use the same gate a text room would.
 */
export const CHANNEL_MANAGER_RANK = 2

export const canManageChannels = user => rankOf(user?.role) >= CHANNEL_MANAGER_RANK

export const labelFor = role => ROLE_LABELS[role] ?? 'Member'

export function roleForRank(rank) {
  const match = Object.entries(RANKS).find(([, value]) => value === rank)
  return match ? labelFor(match[0]) : 'Member'
}
