CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  color TEXT NOT NULL DEFAULT '#93c5fd',
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  muted_until TIMESTAMPTZ,
  banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  slowmode INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dm_threads (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dm_members (
  thread_id INTEGER NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS friendships (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
  thread_id INTEGER REFERENCES dm_threads(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'member',
  content TEXT NOT NULL,
  system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- profile customisation (added after the first schema; keeps older databases in step)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns TEXT NOT NULL DEFAULT '';

-- chatting unlocks only after the 10 rules are accepted (NULL = not yet agreed)
ALTER TABLE users ADD COLUMN IF NOT EXISTS rules_accepted_at TIMESTAMPTZ;

-- announcement rooms: everyone reads, only the Owner posts
ALTER TABLE channels ADD COLUMN IF NOT EXISTS announce BOOLEAN NOT NULL DEFAULT FALSE;

-- More than one owner is allowed (ownership can be shared between accounts).
-- The first account on a fresh server still becomes the only owner of that moment: the
-- check runs under a transaction advisory lock in routes/auth.js, so two people
-- registering at the same instant cannot both grab it.
DROP INDEX IF EXISTS users_single_owner;
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

CREATE INDEX IF NOT EXISTS messages_channel_idx ON messages (channel_id, id DESC);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages (thread_id, id DESC);

-- fixing a typo, quoting someone, and reacting to a message
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id BIGINT REFERENCES messages(id) ON DELETE SET NULL;

-- collectible cosmetic flairs: won on the wheel, worn next to your name, no powers at all
CREATE TABLE IF NOT EXISTS user_flairs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flair TEXT NOT NULL,
  equipped BOOLEAN NOT NULL DEFAULT TRUE,
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, flair)
);

-- when this account last turned the wheel (NULL = never spun)
ALTER TABLE users ADD COLUMN IF NOT EXISTS flair_spun_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- "@username" said in a message, recorded so the person can be told rather than noticing late
CREATE TABLE IF NOT EXISTS message_mentions (
  message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

-- the custom tag: a 0.01% wheel win that unlocks a word of your own next to your name
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_tag TEXT;

-- season pass: a minute with a socket open is XP, and tiers hand out cosmetics (never flairs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS pass_season TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS pass_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pass_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pass_tier INTEGER NOT NULL DEFAULT 0;
-- which token rewards were already paid this season, so a restart cannot pay twice
ALTER TABLE users ADD COLUMN IF NOT EXISTS pass_spin_awarded INTEGER NOT NULL DEFAULT 0;

-- extra turns of the wheel, handed out by the season pass
ALTER TABLE users ADD COLUMN IF NOT EXISTS spin_tokens INTEGER NOT NULL DEFAULT 0;

-- Royal Coins: 100 drop every 10 minutes, a wheel turn costs 1000, the vault can double them.
-- coins_claimed_at is the start of the current 10-minute window, so the accrual never drifts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS royal_coins INTEGER NOT NULL DEFAULT 0;
-- Owners hold a near-limit fortune, which no 4-byte integer can hold, so the balance is BIGINT.
ALTER TABLE users ALTER COLUMN royal_coins TYPE BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins_claimed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- what the vault paid out, so the last few rolls can be shown back to the player
CREATE TABLE IF NOT EXISTS coin_bets (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wager INTEGER NOT NULL,
  risk TEXT NOT NULL,
  roll INTEGER NOT NULL,
  won BOOLEAN NOT NULL,
  payout INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coin_bets_user_idx ON coin_bets (user_id, id DESC);
