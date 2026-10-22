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
- **Presence is in-memory only.** `server/realtime.js` keeps a socket count per user for
  `presence:update` and a `where` map (`{kind: 'channel'|'dm', id}`) that clients push over the
  `presence:where` socket event whenever their view changes; the snapshot rides along in
  `GET /api/me`. Both maps are cleared by an API restart, and the rooms are re-learned as clients
  reconnect. The "Who's online" board (`web/src/components/OnlineBoard.jsx`) renders from that data.
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
