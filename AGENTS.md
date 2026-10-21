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
  seed bails out as soon as any user exists, so `node --watch` restarts are harmless.
- **Demo data only appears on a virgin database.** If you ever need the seed back without destroying
  messages, promote an account by hand rather than wiping the data volume.
- **Roles are enforced server-side only.** `owner > co-owner > admin > mod > member`; you may never
  act on someone at or above your own rank, and `/role` can only hand out ranks below your own.
  The UI merely filters the command list it is given (`GET /api/me` → `commands`).
- **Muting blocks channel and DM posting**; bans revoke sessions and refuse future logins.
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
- **Healthchecks use existing routes**: the API answers `/api/me` with 401 for anonymous requests, so
  the check treats anything under 500 as alive; the web check fetches `/` plus the proxied `/api/me`
  so a dead backend fails the frontend's health too.

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
open a DM) and checking `docker compose logs api`.

## Releasing it

`Dockerfile` builds the web app and serves it plus the API from one container: `SERVE_WEB=1` makes
`server/index.js` serve `web/dist` with an SPA fallback (`/api` and `/socket.io` excluded).
`docker-compose.prod.yml` runs that image with Postgres, and its optional `https` profile adds Caddy
(`Caddyfile`) for Let's Encrypt certificates and the WebSocket upgrade;
`deploy.env.example` lists the variables.

`render.yaml` is the zero-input hosted path: a Render Blueprint (`runtime: docker`, free plan) plus a
free Postgres, with `DATABASE_URL` injected by `fromDatabase`. Render supplies `PORT` itself, so the
blueprint sets no port. Free plan sleeps when idle and the free database expires 30 days after
creation — say so whenever a URL is handed out.

Release and sandbox wiring differ on purpose: the sandbox runs a Vite dev server proxying to a
separate API on :8000, a release serves both from Express on one port. Keep `SERVE_WEB` unset in
`docker-compose.base44.yml` so the preview keeps serving live source, and never point the preview at
a production image — edits would stop showing.

## Accounts and seed data

There are no demo accounts and no pre-made conversations. The seed creates only the empty channels
(`#general`, `#design`, `#random`) and only when the `channels` table is empty.

The **first account to register becomes the owner** (`server/routes/auth.js`); every later signup is
a member and has to be promoted with `/role`. Consequence for testing: if you delete the last owner,
register a fresh account to take the role back rather than editing rows by hand. Never seed
predictable passwords again — that is what made the old demo accounts a security hole.
