import { q } from './db.js'

// The season pass rewards time spent in the building. A minute with a socket open is XP;
// enough XP clears a tier, and tiers hand out cosmetics — never flairs, those stay on the
// wheel. Frames wrap your picture, the pass badge sits next to your name, and the tokens
// buy extra turns of the wheel, which is the only thing here that points back at it.

export const XP_PER_MINUTE = 2
export const TIER_XP = 50
export const MAX_TIER = 10

/** `2026-10`: the season rolls over on the first of the month (UTC). */
export function currentSeason(now = new Date()) {
  return now.toISOString().slice(0, 7)
}

// Rewards are derived from the tier, never stored: clearing a tier is the whole state.
export const PASS_TIERS = [
  { tier: 2, rewards: [{ kind: 'spin', value: 1, text: 'an extra spin at the wheel' }] },
  { tier: 3, rewards: [{ kind: 'frame', value: 'ember', text: 'ember frame on your avatar' }] },
  { tier: 4, rewards: [{ kind: 'spin', value: 1, text: 'another spin token' }] },
  { tier: 5, rewards: [{ kind: 'frame', value: 'frost', text: 'frost frame on your avatar' }] },
  { tier: 6, rewards: [{ kind: 'spin', value: 2, text: 'two spin tokens' }] },
  { tier: 8, rewards: [{ kind: 'frame', value: 'void', text: 'void frame on your avatar' }] },
  {
    tier: 10,
    rewards: [
      { kind: 'frame', value: 'aurora', text: 'aurora frame on your avatar' },
      { kind: 'spin', value: 3, text: 'three spin tokens' },
    ],
  },
]

export function tierFor(xp) {
  return Math.max(0, Math.min(MAX_TIER, Math.floor(xp / TIER_XP)))
}

/** Every reward unlocked at or below a tier. */
export function rewardsUpTo(tier) {
  return PASS_TIERS.filter(entry => entry.tier <= tier).flatMap(entry =>
    entry.rewards.map(reward => ({ ...reward, tier: entry.tier })),
  )
}

/** Tokens earned from the pass at a given tier, so crediting stays idempotent. */
const tokensUpTo = tier =>
  rewardsUpTo(tier)
    .filter(reward => reward.kind === 'spin')
    .reduce((sum, reward) => sum + reward.value, 0)

export function frameFor(tier) {
  const frames = rewardsUpTo(tier).filter(reward => reward.kind === 'frame')
  return frames.length ? frames[frames.length - 1].value : null
}

/** What the client needs to paint the pass: progress, tier, unlocked rewards. */
export function passState(row) {
  const season = currentSeason()
  const inSeason = row?.pass_season === season
  const xp = inSeason ? Number(row.pass_xp ?? 0) : 0
  const minutes = inSeason ? Number(row.pass_minutes ?? 0) : 0
  const tier = tierFor(xp)
  return {
    season,
    xp,
    minutes,
    tier,
    maxTier: MAX_TIER,
    xpPerMinute: XP_PER_MINUTE,
    tierXp: TIER_XP,
    xpInto: tier >= MAX_TIER ? TIER_XP : xp - tier * TIER_XP,
    nextTierXp: tier >= MAX_TIER ? null : (tier + 1) * TIER_XP,
    frame: frameFor(tier),
    spinTokens: Number(row?.spin_tokens ?? 0),
    tiers: PASS_TIERS.map(entry => ({
      tier: entry.tier,
      unlocked: tier >= entry.tier,
      rewards: entry.rewards.map(reward => ({ kind: reward.kind, value: reward.value, text: reward.text })),
    })),
  }
}

/**
 * Credit time on the site. Called once a minute per open socket; the season reset and the
 * one-off token grant both fall out of the totals, so a restart or a double tick cannot
 * hand out a reward twice.
 */
export async function addPresenceMinutes(userId, minutes = 1) {
  const season = currentSeason()
  const { rows } = await q(
    'SELECT pass_season, pass_xp, pass_spin_awarded FROM users WHERE id = $1',
    [userId],
  )
  if (!rows.length) return null
  const row = rows[0]
  const sameSeason = row.pass_season === season
  const xp = (sameSeason ? Number(row.pass_xp ?? 0) : 0) + minutes * XP_PER_MINUTE
  const paid = sameSeason ? Number(row.pass_spin_awarded ?? 0) : 0
  const tier = tierFor(xp)
  const owed = tokensUpTo(tier)
  const bonus = Math.max(0, owed - paid)

  const { rows: updated } = await q(
    `UPDATE users
        SET pass_season = $2,
            pass_xp = $3,
            pass_minutes = CASE WHEN pass_season = $2 THEN pass_minutes + $4 ELSE $4 END,
            pass_tier = $5,
            pass_spin_awarded = $6,
            spin_tokens = spin_tokens + $7
      WHERE id = $1
      RETURNING pass_season, pass_xp, pass_minutes, pass_tier, spin_tokens`,
    [userId, season, xp, minutes, tier, Math.max(paid, owed), bonus],
  )
  return passState(updated[0])
}

export const OWNER_HOURS = 999
export const OWNER_MINUTES = OWNER_HOURS * 60

/**
 * Hand someone the finished pass: 999 hours on the clock clears every tier, and the
 * tokens those tiers owe are paid once (same idempotent grant as the presence tick).
 */
export async function completePass(userId, minutes = OWNER_MINUTES) {
  const season = currentSeason()
  const { rows } = await q('SELECT pass_season, pass_spin_awarded FROM users WHERE id = $1', [userId])
  if (!rows.length) return null

  const row = rows[0]
  const paid = row.pass_season === season ? Number(row.pass_spin_awarded ?? 0) : 0
  const xp = Math.max(MAX_TIER * TIER_XP, minutes * XP_PER_MINUTE)
  const owed = tokensUpTo(MAX_TIER)

  const { rows: updated } = await q(
    `UPDATE users
        SET pass_season = $2,
            pass_xp = $3,
            pass_minutes = $4,
            pass_tier = $5,
            pass_spin_awarded = $6,
            spin_tokens = spin_tokens + $7
      WHERE id = $1
      RETURNING *`,
    [userId, season, xp, minutes, MAX_TIER, Math.max(paid, owed), Math.max(0, owed - paid)],
  )
  return passState(updated[0])
}

/** Owners start the season finished; this only fills in what is still missing. */
export async function ensureOwnerSeason(user) {
  if (user?.role !== 'owner') return null
  const state = passState(user)
  if (state.tier >= MAX_TIER && state.minutes >= OWNER_MINUTES) return null
  return completePass(user.id)
}
