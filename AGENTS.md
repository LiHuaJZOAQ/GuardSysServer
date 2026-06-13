# GuardSys Server — Agent Guide

## Structure

```
server/    — Express + Socket.io + better-sqlite3 (single index.js entry)
web/       — Vue 3 + Vite + Socket.io-client + Chart.js
```

Two independent Node packages, each with own `package.json` and `npm install`.

## Commands

```bash
# Backend (server/)
npm install
npm run dev        # plain `node index.js`, no nodemon/hot-reload
node test.js       # integration test — only test suite (no framework)

# Frontend (web/)
npm install
npm run dev        # Vite dev server on :5173
npm run build      # outputs to web/dist/
```

No lint, typecheck, or formatter scripts exist. No CI.

## Architecture

- **Port 3000** — HTTP server (Express + Socket.io) for web frontend + REST API
- **Port 3001** — Raw TCP server for hardware devices (net.createServer)
- Devices send `\n`-delimited JSON lines over TCP, receive `{"success":true}` or `{"error":"..."}`
- Web clients connect via Socket.io for real-time sensor:data / device:online events
- SQLite DB (`guardsys.db`, auto-created, gitignored via `*.db`) with auto-migration on startup
- Default user: `admin / admin123` (seeded on first run)
- Auth: JWT (`POST /api/auth/login` → bearer token, 24h expiry)
- Server酱 push: optional, enabled when `SCKEY` env var is set (thresholds: smoke ≥200 or temp ≥40)
- Sensor logs auto-purged after 7 days; offline detection every hour

## Deployment

- **Backend** → Railway (see `server/railway.json`, heroku-buildpacks/node)
- **Frontend** → Vercel (see `web/vercel.json`, root dir = `web/`) or **GitHub Pages** (via `.github/workflows/deploy-pages.yml`)
- `VITE_SERVER_URL` env var required for web to reach backend (defaults to `http://localhost:3000`)
- GitHub Pages uses Hash history mode (`createWebHashHistory`), not `createWebHistory` — set in `web/src/main.js`
- In production, server also serves `web/dist/` as static fallback at `/*`
- Railway auto-builds the frontend: `server/package.json` has `postinstall: "cd ../web && npm install && npm run build"`

## Device Protocol (TCP port 3001)

**Report:**
```json
{"type":"report","temp":"25.3","humi":"60.1","smoke":12.34,"ir":true,"alarm":0}
```

**Control (server → device):**
```json
{"type":"cmd","action":"setAlarm","value":1}
```

Actions: `setAlarm` (0/1/2), `collect` (no value).

## Testing

```bash
cd server
node test.js       # starts fresh, needs server already running
```

Sequential integration test covering: login, auth guard, TCP device connection, data report, device list, latest data, history, control command, alarm trigger, offline handling.
