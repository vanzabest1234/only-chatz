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

### Managed hosting

The image is self-contained, so any Docker-capable host (Koyeb, Fly.io, …) can build the
`Dockerfile` directly. Give it a Postgres — Neon's free tier is the usual no-cost choice — as
`DATABASE_URL`, leave the port alone (the app reads `PORT`), and that is the whole setup. Free tiers
change their limits, so check the current offering before relying on one.

### Launcher page and `/chat`

`web/public/launcher.html` is the landing page: `/` serves it, and it has two ways in —
**Open in a new tab** and **Load it here**, which embeds the room in an iframe. If the browser (or a
sandboxed iframe) refuses the new tab, it loads the room in place instead. It points at `/chat` on
whatever site serves it, so it needs no configuration. Hosting it somewhere else? Set `APP_URL` at
the top of the file, or pass `?chat=https://your-app-url`.

The room lives on `/chat`: there is no client-side router, and both the Vite dev server and the
release server fall back to `index.html` for every path except `/`, so `/chat` (and anything else)
serves the room. The launcher is the only exception, mapped to `/` in `web/vite.config.js` for dev
and in `server/index.js` for releases.

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
