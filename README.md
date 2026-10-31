# only-chatz

A floaty little chatroom where everyone can talk — Discord-shaped, cloud-soft.

- **Channels** with topics and slowmode, messages broadcast live over WebSockets.
- **Roles with real power**: Owner → Co-Owner → Admin → Mod → Member. You can never act on someone
  at or above your own rank.
- **Direct messages** with a friends list so the people you care about live at the top.
- Everyone in a channel sees moderation actions, so the room stays honest.

## Run it

```bash
docker compose -f docker-compose.base44.yml up -d
```

The app is served on **http://localhost:3000** (Vite dev server, live reload; the API and Postgres
run alongside it).

Rooms start empty. Register from the sign-in screen — the first account created becomes the **Owner**,
and everyone after that joins as a Member until an admin or owner promotes them.

## Release it

The repo ships one release image: it builds the React app and serves the site **and** the API
(WebSockets included) from a single origin, so there is no CORS config and no second port.

### Anywhere with Docker — your own server, or a free container host

```bash
cp deploy.env.example .env    # set POSTGRES_PASSWORD (and DOMAIN if you have one)
docker compose -f docker-compose.prod.yml up -d --build
```

- The site comes up on port **3000** (`APP_PORT` changes it); Postgres sits behind it on a volume.
- Have a domain pointing at the machine? Add `DOMAIN=chatz.example.com` to `.env` and start with
  `docker compose -f docker-compose.prod.yml --profile https up -d` — Caddy fetches a free
  Let's Encrypt certificate and proxies the WebSocket upgrade the chat needs.

### Free random URL on Render — nothing to type

`render.yaml` describes the whole stack, so Render builds it for you and hands back a random
`https://<something>.onrender.com` link:

1. Sign in at [render.com](https://render.com) with GitHub (one click — Render needs an account).
2. **New → Blueprint**, pick this repository, press **Apply**.

Render builds the `Dockerfile`, creates the free Postgres, and sets `DATABASE_URL` itself. The first
account made at that URL becomes the Owner.

Free plan, so expect two things: the site sleeps after ~15 minutes idle and takes about a minute to
wake on the next visit, and the free database expires 30 days after creation (14-day grace period
before its data is deleted). Upgrade the database when the room should last.

### A public link with no account anywhere

No sign-up, no card, no domain, no open port: Cloudflare's quick tunnel dials out from the machine
running the stack and hands back a random `https://` address.

```bash
cp deploy.env.example .env                        # set POSTGRES_PASSWORD (any random text)
docker compose -f docker-compose.prod.yml --profile public up -d --build
docker compose -f docker-compose.prod.yml logs tunnel | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'
```

Open that link on any device — the site, the API and the WebSocket all arrive through it. Two things
to know: the address is **random and changes every time the stack starts**, and it **lasts only while
the `tunnel` container runs** (stop it, or sleep the machine, and the link dies). That makes it the
right tool for showing the room to people today; for a link that never moves, point a domain at the
machine and use the `https` profile above — still no third-party account.

Leave `APP_PORT` alone unless 3000 is taken locally (the tunnel talks to the app container directly,
so the published port only matters for your own machine).

### Deploy on push

The branch that ships is **`main`**, and a push to it releases without anyone pressing a button:

- **Render** — handled by Render itself. `render.yaml` sets `branch: main` and
  `autoDeployTrigger: commit`, so every merge rebuilds the image, runs the boot migration and swaps
  the service over. Nothing to configure.
- **Any other host** — add its deploy hook as a repository secret named `DEPLOY_HOOK_URL`
  (Render's *Deploy Hook* URL, Coolify's webhook, or any endpoint that takes a `POST`). Merging to
  `main` then calls it from `.github/workflows/deploy.yml`, which also has a manual **Run workflow**
  button. With no secret set the job logs that and exits successfully, so it never clashes with a
  host that already watches the repository itself.

Feature work lands on a branch and goes in through a pull request, so `main` is always what is
live — an unreviewed push to a working branch never deploys.

### Managed hosting

The image is self-contained, so any Docker-capable host (Koyeb, Fly.io, …) can build the
`Dockerfile` directly. Give it a Postgres — Neon's free tier is the usual no-cost choice — as
`DATABASE_URL`, leave the port alone (the app reads `PORT`), and that is the whole setup. Free tiers
change their limits, so check the current offering before relying on one.

### Launcher page and `/chat`

The room is the front door. `/`, `/royal-angel.html` and `/royal-angel` all render the
app immediately — no splash to click through — and, in a release build, the address bar is pointed
at `/chat` on load, query string kept so an access token survives. The dev server (the sandbox
preview) leaves the address bar alone: its host only resolves the document path it served, so a
rewritten `/chat` there answers "not found". There is no client-side router, so every path ends up
rendering the same app. The entry list lives in `web/vite.config.js` for dev and in
`server/index.js` for releases, and the client's URL fix-up in `web/src/main.jsx`.

`web/public/launcher.html` is served as its own page (it is not an entry path, so the file wins over
the SPA fallback). It offers two ways into the room: "open in about:blank" drops the chat into a bare
tab whose address bar stays `about:blank`, and "open in iframe" shows the same room inside the page
with a `×` to return to the two choices. Its logic is `web/public/launcher.js` (a separate file — the
preview does not run inline scripts), and it opens the room at `/` in both cases.

Accounts are **username + password** only — no email anywhere. Signing up asks for the password
twice and refuses a mismatch.

### Before you invite people

- Registration is open to anyone with the URL; promote with `/role` and use `/ban` if a room turns
  ugly.
- There is no password reset or email verification yet — username and password only.
- Back up the Postgres volume: it holds every account and every message.

## Commands

Type `/` in the composer to see what you can use.

| command | who | what it does |
| --- | --- | --- |
| `/help` | everyone | List the commands available to you |
| `/nick <name>` | everyone | Change your display name |
| `/topic <text>` | Mod+ | Set this channel's topic |
| `/slowmode <seconds>` | Mod+ | Throttle posting (0 turns it off) |
| `/clear <count>` | Mod+ | Remove recent messages in the channel |
| `/mute @user <minutes> [reason]` | Mod+ | Stop someone posting for a while |
| `/unmute @user` | Mod+ | Let someone post again |
| `/kick @user [reason]` | Admin+ | Sign someone out |
| `/ban @user [reason]` | Admin+ | Block someone from signing in |
| `/unban @user` | Admin+ | Let a banned person back in |
| `/role @user <role>` | Admin+ | Hand out a role below your own |

## Stack

React + Vite · Express + Socket.IO · Postgres. Everything self-hosted — no API keys required.
Setup notes and gotchas live in `AGENTS.md`.
