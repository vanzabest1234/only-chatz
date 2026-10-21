export function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    color: row.color,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? '',
    mutedUntil: row.muted_until ?? null,
  }
}

export function publicMessage(row) {
  return {
    id: Number(row.id),
    channelId: row.channel_id ?? null,
    threadId: row.thread_id ?? null,
    authorId: row.author_id ?? null,
    authorName: row.display_name ?? row.author_name ?? 'Unknown',
    authorRole: row.role ?? row.author_role ?? 'member',
    authorColor: row.color ?? '#93a0c9',
    authorAvatar: row.avatar_url ?? null,
    content: row.content,
    system: Boolean(row.system),
    createdAt: row.created_at,
  }
}
