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
curl -s -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"zara","password":"zara123"}'          # returns a token
```

Served assets must be live source: `curl -s localhost:3000/src/main.jsx` should return transformed
JSX with `/@vite/client` in the page shell. If it looks minified, the compose file is running a
production build instead of the dev server.

There is no test suite; verification is done by driving the UI (sign in, post, run a slash command,
open a DM) and checking `docker compose logs api`.

## Demo accounts

`zara` (owner), `milo` (co-owner), `ada` (admin), `kai` (mod), `juno` and `remy` (members).
Every password is the username plus `123` (e.g. `zara123`). Seeded channels: `#general`,
`#design`, `#random`, plus one DM between kai and juno.
