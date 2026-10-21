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
