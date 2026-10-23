# Only Chatz — working notes

A floaty, Discord-style chatroom. React + Vite frontend, Express + Socket.IO API, Postgres.

## How it runs here

```
web  (node:22, vite dev on 5173)  →  published on host port 3000
api  (node:22, node --watch)      →  :8000, talks to db
db   (postgres:16-alpine)         →  volume chatz-db
```

Non-obvious things worth knowing before changing something:

- **Single origin, always.** The browser only ever talks to port 3000. Vite proxies `/api` and
  `/socket.io` (with `ws: true`) to `http://api:8000`. Do not "simplify" this by exposing the API
  on its own port — the client has no API URL config and realtime would need CORS + credentialed
  WebSockets.
- **Auth is a bearer token in `localStorage`, not a cookie.** The preview renders inside a
  cross-site iframe, where `SameSite` cookie rules make cookie sessions unreliable. Sessions are
  rows in the `sessions` table; the client sends `Authorization: Bearer …`, and Socket.IO gets the
  same token through `handshake.auth.token`. Anything that adds auth must follow both paths
  (`server/auth.js` and the `io.use` middleware in `server/realtime.js`).
- **Schema + seed run inside API boot** (`server/index.js` → `migrate()` → `seed()`), not as a
  separate one-shot compose service. `schema.sql` is idempotent (`CREATE … IF NOT EXISTS`), and the
  seed re-asserts the fixed room list on every boot, updating `position` from `server/seed.js` — that is
  how an older database picks up `#announcements` and a changed room order — so `node --watch`
  restarts are harmless.
- **Demo data only appears on a virgin database.** If you ever need the seed back without destroying
  messages, promote an account by hand rather than wiping the data volume.
- **Roles are enforced server-side only.** `owner > co-owner > admin > mod > member`; you may never
  act on someone at or above your own rank. **Only the Owner hands out roles** — `/role` is
  `minRank: 4` and re-checks `actor.role === 'owner'`, so co-owners and admins cannot promote anyone;
  every later signup is a plain member until the Owner promotes them.
  The UI merely filters the command list it is given (`GET /api/me` → `commands`).
- **Muting blocks channel and DM posting**; bans revoke sessions and refuse future logins.
- **Chatting needs the 10 rules accepted.** `users.rules_accepted_at` stays NULL until the account
  agrees on the gate (`web/src/components/RulesGate.jsx`, which also owns the rule text); until then
  `checkCanSpeak` refuses every channel and DM post (slash commands included), while reading stays
  open. `POST /api/rules/accept` stamps the column and returns the fresh `user`, which is what flips
  `rulesAccepted` in `GET /api/me`. Declining only closes the gate for that session — the banner
  above the composer reopens it, so a refusal can be taken back without a new account.
- **`#announcements` is read-only for everyone but the Owner.** The room carries
  `channels.announce = TRUE`; `checkCanSpeak` refuses every message (slash commands included)
  from a non-owner, and the client disables the composer for them. Everyone still sees the room
  and its messages — the flag only gates writing. Adding another announcement room means setting
  the same column, not adding a second rule.
- **Messages can be edited, replied to and reacted to.** `messages.edited_at` and
  `messages.reply_to_id` plus the `message_reactions` table carry it.
  `PATCH /api/messages/:id` only touches your own message and always stamps `edited_at`, which the
  UI renders as "(edited)"; a reply must point at a message in the *same* room (`readReply`
  compares the room column) and the client shows the quoted line above the text; reactions come
  from a fixed six-emoji palette (`REACTIONS` in `routes/chat.js`) and tapping your own again
  removes it. Both changes are broadcast as `message:update` to the message's room, so every open
  client re-renders from that one payload — the client never patches optimistic state itself.
  The action buttons live in `MessageList.jsx` and reveal on hover, and stay visible on
  `(hover: none)` touch screens; "edit" only appears on your own messages.
- **Deleting a message follows the same split: your own, or anyone's if you are the Owner.**
  `DELETE /api/messages/:id` refuses a non-owner acting on someone else's message (403) and
  removes the row otherwise; `reply_to_id` is `ON DELETE SET NULL` and `message_reactions`
  cascades, so quotes and reactions go with it. The room is told `message:delete` with just
  `{id, channelId, threadId}` and every client drops it from its list, so nothing re-renders from a
  stale payload. Unlike an edit, a delete is also audited (`message-deleted`) when the Owner removes
  someone else's message.
- **Flairs, the wheel, and the season pass are cosmetics only.** `server/flairs.js` owns the wheel
  weights (the roll happens there, never in the browser) and `MAX_EQUIPPED = 3` — owning a flair
  never expires, but only three can be worn at once, so `POST /api/flairs/equip` refuses a fourth.
  `bread` is off the wheel (`/bread`, Owner only); `custom` is the 0.01% slice that unlocks a
  user-written tag in settings. One free spin a day (`users.flair_spun_at`), and a pass spin token is
  spent instead of waiting — the client only enables the button when a token is banked.
  `server/pass.js` turns one minute of an open socket into 2 XP (`pass_xp`/`pass_minutes`, reset by
  `pass_season` = `YYYY-MM`), and tier rewards are derived from the tier, never stored: frames
  (`frame-ember|frost|void|aurora` in `console.css`) come from `frameFor(tier)` in the serializers,
  and extra tokens are granted idempotently from `pass_spin_awarded`. Owners hold the whole wheel
  (`grantOwnerWheel`) and start every season finished — `ensureOwnerSeason` completes the track at
  999 hours (`completePass`) the first time an owner's snapshot is loaded. Handing either out mirrors
  `/role`: `/flair <flair> @user` and `/pass @user` are Owner-only (alongside `/bread @user`), and
  the flair word is whichever argument is a known flair key, so `@user` may come first.
  Nothing here grants permissions — never wire a flair to a role check.
  The custom tag itself takes any characters up to 20 — only control/invisible ones are stripped.
- **A mention is a ping, delivered over sockets.** Channel/DM posts parse `@username` in
  `notifyMentions` (`routes/chat.js`), record it in `message_mentions` and emit `ping:new` to
  `user:<id>`; `App.jsx` answers with a chime and a toast whose room label comes from the payload,
  so tapping it can switch the view. Mentions are matched against `@username`, never display names.
- **Royal Coins are the currency, and the clock is the wallet.** `server/coins.js` owns it:
  `COIN_PER_TICK` (100) per `TICK_MINUTES` (10) is worked out from `users.coins_claimed_at`, so
  nothing is paid by a timer alone — `accrueCoins` collects every whole window that has passed and
  only advances the window it read (compared as `::text`, because a JS `Date` loses the microseconds
  and would never match). A long absence collects at most an hour (six ticks); the 10s
  `startCoinClock` in `realtime.js` pays open sockets and emits `coins:update` to `user:<id>`,
  which `App.jsx` folds into `me.user.coins`. Spend through `spendCoins` / `settleBet` only: both
  check the balance in the same statement that moves it, so two tabs cannot spend one coin twice.
  `users.royal_coins` is `NUMERIC`: a purse can be handed a fortune past what `BIGINT` holds, and a
  balance too large for a JS number travels to the client as a digit string (`walletValue` /
  `coinText` in `coins.js`, `money` in `web/src/lib/format.js`) so nothing is rounded on the way out.
  Owners hold `OWNER_COINS` (999999999999999) — effectively infinite: every read of an owner's
  wallet lifts it back to that balance, so no bet or spin drains an owner, and a bigger purse is
  left untouched. Everyone else lives off the drip alone.
- **Four coin commands everyone can run** (`server/commands.js`, all `minRank: 0`):
  `/steal @user` takes a quarter of the target's purse on a 50/50 roll and pays the same amount
  when it fails; `/punch @user` silences them for 60 seconds but is refused while the target holds
  more coins than you; `/crush` names a random other account and rolls a chemistry score;
  `/gamble <amount>` stakes between `MIN_BET` and `MAX_BET` through `settleBet` and returns one of
  four weighted outcomes (`GAMBLE_OUTCOMES` in `server/casino.js`, ~90.5% returned). Owners are
  immune to both `/steal` and `/punch`, and every balance change pushes `coins:update` to the
  affected accounts.
- **Eight member commands hang off the same table** (`server/commands.js`, all `minRank: 0`):
  `/8ball <question>`, `/flip`, `/roll [sides]` (2-1000, default d6) and `/quote` pick their line
  server-side from `EIGHT_BALL` / `QUOTES`; `/whois @user`, `/stats` and `/rank [@user]` read the
  database (purse, equipped flairs, message count, ladder position by `royal_coins`, banned accounts
  left out) and change nothing; `/ask <command>` forwards to `answerAi` in `server/ai.js`, so the
  Royal Aide answers in the room itself and `/ask` posts no line of its own. Every other command's
  reply goes through `postSystem`, which is a system message — permanent, like the coin commands.
- **The coin ladder is one query, two surfaces.** `topWallets` in `server/coins.js` reads the ten
  richest purses (`LEADERBOARD_SIZE`, highest first, banned accounts left off). `GET /api/leaderboard`
  feeds the panel (`LeaderboardPanel.jsx`, opened from the sidebar) and `/leaderboard` (minRank 0)
  posts the same rows as a system message, so the two cannot drift.
- **A turn of the wheel costs coins, not a day's wait.** `SPIN_COST` is 1000; a banked pass token
  (`spin_tokens`) is spent first as a free turn, otherwise the coins are charged before the roll.
  The `402` it returns carries the balance. `flair_spun_at` is still in the table but no longer read.
- **The vault (`server/casino.js` + `routes/casino.js`) is the gambling table.** Four stakes,
  each with a house edge: steady 75% ×1.25, even 50% ×1.9, bold 25% ×3.6, royal 10% ×8.5. The d100
  roll happens server-side with `randomInt`, the stake and payout move in one `settleBet` statement,
  and every roll lands in `coin_bets` so the panel can show the last few. Bets are rate-limited
  (20 / 10s per account) and capped at `MAX_BET`; `wager` must be a whole number ≥ `MIN_BET`.
  Never trust a roll, wager or result sent by the client.
- **The Royal Aide answers `!ask …` (`server/ai.js` + `server/aide-voice.js`).** It is a local
  command table with a conversational front, not a model: no external service is called and it
  costs nothing to run. `routes/chat.js` answers a channel message matching `^!ask` (6 per minute
  per account) with a system message from `author_name` `Royal Aide`, broadcast as `message:new`.
  When the first word after `!ask` names a command the command runs; anything else goes to
  `converse` in `aide-voice.js`, which answers plain questions in the Aide's voice from live data
  (purse, ladder leaders, presence) and recognises greetings, thanks, "how are you", identity,
  coins, wheel, pass and rules, plus arithmetic when the text is a sum — with a polite fallback for
  anything past its line. Adding a command is one `{ name, usage, description,
  run({ actor, channel, args }) }` entry in `AI_COMMANDS`; `run` returns the sentence to say or
  `{ error }`. The table is help/balance/stats/top/online/who/summarize/count, the fun ones (joke,
  fact, riddle, compliment, roast, coin, dice, choose) and math/time. `!ask help [topic]` prints it.
  System messages cannot be edited or deleted.
- **Presence is in-memory only.** `server/realtime.js` keeps a socket count per user for
  `presence:update` and a `where` map (`{kind: 'channel'|'dm', id}`) that clients push over the
  `presence:where` socket event whenever their view changes; the snapshot rides along in
  `GET /api/me`. Both maps are cleared by an API restart, and the rooms are re-learned as clients
  reconnect. The "Who's online" board (`web/src/components/OnlineBoard.jsx`) renders from that data.
- **Typing indicators are in-memory too, and never persisted.** `Composer.jsx` pings
  `socket.emit('typing', {kind, id})` at most once every 2s while the box has text; `realtime.js`
  checks the room belongs to the sender, stores the display name in a `typing` map with a 4s expiry
  and relays `typing:update` (`{kind, id, names}`) to everyone else in that room. A 1s sweep drops
  expired names and re-broadcasts, and the names are dropped on disconnect, so a closed tab cannot
  leave a ghost. The line above the composer renders from `App.jsx`'s `typing` state
  (`typingLabel` in `ChatPane.jsx`): one name, "a and b are typing", or "more than 7 people are
  typing" once eight or more are going at once. Nothing is stored, so a restart only loses the
  current notes.
- **Tapping an avatar opens a profile banner.** `web/src/components/ProfileCard.jsx` renders name,
  `@username`, role, pronouns, online state and bio from the `me.members` entry (nothing is fetched);
  the message-list avatars (`ProfileAvatar` in `MessageList.jsx`) and the members panel's separate
  avatar button open it. Pronouns live in `users.pronouns` (max 24 chars, edited in
  `SettingsModal.jsx`, saved through `PATCH /api/me/profile`); bio comes from the existing column.
- **Avatars are data URLs in `users.avatar_url`**, cropped to 256px by the browser in
  `SettingsModal.jsx`; `express.json` is limited to 1mb for that payload. No file storage involved.
- **Sandbox-specific config is gated on `BASE44_PREVIEW_MODE === "1"`**: `web/vite.config.js` adds
  `.<BASE44_SANDBOX_HOST_DOMAIN>` to Vite's `allowedHosts` (the preview host rotates). With the flag
  unset the allowlist is untouched. `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` is passed through from
  the platform. Never hardcode resolved `BASE44_*` hostnames anywhere.
- **There is no client router.** Every path (`/chat` included) renders the same SPA because Vite and
  the release server both fall back to `index.html`; `/api` and `/socket.io` are excluded in
  `server/index.js`. Do not add a router just to give the room a URL.
- **The launcher is the landing page and is part of the built site.** `web/public/launcher.html` is
  served statically at `/launcher.html` (Vite `publicDir` in dev, `web/dist` in releases) and is
  mapped to `/` by the `launcherAtRoot` plugin in `web/vite.config.js` and by the fallback in
  `server/index.js`. Do not move it back to the repo root: nothing outside `web/` is served, so `/`
  and `/launcher.html` would silently fall through to the chat app. It is deliberately dependency-free:
  both buttons are plain `<a href="/chat">` anchors, so the room opens even where scripted
  `window.open` / iframe handling is blocked (the old embedded-iframe and `APP_URL`-detection versions
  left the buttons dead inside the preview pane). The script copies the current query string — a
  hosted preview's access token — onto those hrefs, and the "Open in a new tab" button opens its tab
  with `window.open` instead of `target="_blank"` (a sandboxed frame resolves `_blank` to
  `about:blank`); when popups are blocked the anchor's own `/chat` href loads the room in this tab.
  With the script gone both plain `/chat` hrefs still work. Never hardcode a sandbox host: `/chat` is
  relative to whatever site serves the file.
  The page is a static monospace "spec sheet" console (phosphor on void, inline CSS only); its one
  remote asset is the hosted hero image in `media.base44.com`, so the rest works with no network.
  Its room list and "Channels" line are hand-written copy, not fetched: update them whenever
  `server/seed.js` gains or loses a room (they must list `#general`, `#announcements`, `#random`, in
  the room order the seed sets).
- **The chat's console look is one file: `web/src/styles/console.css`,** imported last in `main.jsx`
  after `base.css` and `app.css`. It overrides only the old glass theme — palette, radii, blur, type —
  and matches the launcher's phosphor-on-void console, so `app.css` still owns all layout. Restyle there
  instead of editing component CSS, and keep its `border-radius: 0` rules after the media-query radius
  rules in `app.css` (later import order is what lets them win).
- **Icons are `web/public/favicon.svg`,** linked from both `index.html` and the launcher; without the
  link the browser asks for `/favicon.ico`, which the dev server 404s.
- **Healthchecks use existing routes**: the API answers `/api/me` with 401 for anonymous requests, so
  the check treats anything under 500 as alive; the web check fetches `/` plus the proxied `/api/me`
  so a dead backend fails the frontend's health too.

## Security guard rails

Cheating, flooding and impersonation are refused server-side; nothing depends on the client
behaving. Two modules own it:

- `server/guard.js` — fixed-window rate limits (`take`, `limiter`), the sign-in lockout
  (`recordFailure` / `lockoutSeconds`), `cleanText` / `cleanName` (control characters,
  zero-width and bidi tricks are deleted before anything is stored) and the in-memory audit
  trail (`audit`, read by the Owner at `GET /api/audit`).
- `server/names.js` — one display-name rule set for `/nick` and the profile screen: 2-32
  characters, no reserved words ("owner", "admin", "system", …), never another account's
  `@username`.

Limits in force: 8 messages / 5s and 40 / minute per account (the burst trips first),
10 registrations / hour / IP, 30 sign-ins / 5 min / IP, 5 wrong passwords lock that
username+IP for 30s and double each further failure (15 min cap), 40 socket handshakes /
minute / IP, 5 open sockets per account, 10 `presence:where` events / 10s per socket, and a
1200 request / minute / IP backstop on `/api`.

Things not to undo:

- **Session tokens are stored hashed (sha256).** `sessionUser` still accepts a row stored in
  the clear and rewrites it on use, so rotating this never signs anyone out; new sessions are
  written hashed. `createSession` prunes expired rows on every login.
- **Passwords are 8-128 characters, hashed with async scrypt.** A sign-in for a username that
  does not exist still pays for one scrypt round (`DUMMY_HASH`), so response timing cannot be
  used to enumerate accounts.
- **First signup claims ownership, and ownership can be shared.** Several accounts may hold
  `owner` (currently `shadow` and `vanzabest123`); there is no longer a partial unique index on
  the role. The first-signup decision in `routes/auth.js` runs under a transaction advisory lock
  (`pg_advisory_xact_lock`), so two simultaneous first signups still produce exactly one owner —
  the loser registers as a member. `/role` still refuses to hand out a role at or above your own,
  so sharing ownership is a deliberate database change, not a command.
- **Kick and ban disconnect the person's sockets** (`disconnectUser`), not just their sessions.
- **Presence only reports rooms you belong to**, so `presence:where` cannot be used to claim a
  DM thread id you are not part of.
- **Avatars must be real PNG/JPEG/WebP bytes** — the file signature is checked, not just the
  `data:` prefix.
- **Command targets resolve `@username` first**; a display name is used only when exactly one
  account has it, so a rename cannot redirect a moderator's `/mute`, `/ban` or `/role`.
- **`GET /api/audit` is Owner only**: refused logins, lockouts, floods, denied commands and
  every mute/kick/ban/role change land there.
- **Proxy trust**: `app.set('trust proxy', 1)` plus `xfwd: true` in the Vite proxy is what lets
  the per-IP limits see the real caller. Adding another hop means bumping that number, and the
  API must never be reachable without a proxy that sets `X-Forwarded-For` — a spoofable header
  defeats the IP limits (per-account limits still hold).

## Verify it is actually working

```bash
docker compose -f docker-compose.base44.yml ps          # all three healthy
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000 # 200
curl -s localhost:3000/api/me                            # 401 without a token
curl -s -X POST localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"tester","password":"tester123"}'       # returns a token (first signup = owner)
```

Served assets must be live source: `curl -s localhost:3000/src/main.jsx` should return transformed
JSX with `/@vite/client` in the page shell. If it looks minified, the compose file is running a
production build instead of the dev server.

There is no test suite; verification is done by driving the UI (sign in, post, run a slash command,
open a DM) and checking `docker compose logs api`. Note that `Composer.jsx` holds every send for one
second before it posts, so a message lands about a second after Enter — that gap is deliberate, not a
slow request.

## Releasing it

`Dockerfile` builds the web app and serves it plus the API from one container: `SERVE_WEB=1` makes
`server/index.js` serve `web/dist` with an SPA fallback (`/api` and `/socket.io` excluded).
`docker-compose.prod.yml` runs that image with Postgres, and its optional `https` profile adds Caddy
(`Caddyfile`) for Let's Encrypt certificates and the WebSocket upgrade;
`deploy.env.example` lists the variables.

To run the release beside the preview in the sandbox (it must not take host port 3000):

```bash
printf 'POSTGRES_PASSWORD=%s\nAPP_PORT=8080\n' "$(openssl rand -hex 16)" > /tmp/prod.env
docker compose -f docker-compose.prod.yml --env-file /tmp/prod.env up -d --build   # → :8080
```

`render.yaml` is the zero-input hosted path: a Render Blueprint (`runtime: docker`, free plan) plus a
free Postgres, with `DATABASE_URL` injected by `fromDatabase`. Render supplies `PORT` itself, so the
blueprint sets no port. Free plan sleeps when idle and the free database expires 30 days after
creation — say so whenever a URL is handed out.

Release and sandbox wiring differ on purpose: the sandbox runs a Vite dev server proxying to a
separate API on :8000, a release serves both from Express on one port. Keep `SERVE_WEB` unset in
`docker-compose.base44.yml` so the preview keeps serving live source, and never point the preview at
a production image — edits would stop showing.

## Accounts and seed data

There are no demo accounts and no pre-made conversations. The seed keeps exactly three empty channels,
in this order: `#general`, `#announcements` (owner-only posting, `announce = TRUE`) and `#random`.
Room order comes from `channels.position`, which the seed re-asserts on every boot. `#design` was
removed at the owner's request; there is no room-creation command, so the seed list is the whole set.

The **first account to register becomes the owner** (`server/routes/auth.js`); every later signup is
a member and has to be promoted with `/role`. Consequence for testing: if you delete the last owner,
register a fresh account to take the role back rather than editing rows by hand. Never seed
predictable passwords again — that is what made the old demo accounts a security hole.
