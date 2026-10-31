# Modlist Matrix

Shows which Minecraft versions a list of Modrinth mods supports on a given loader, picks the best version, and builds the client and server packs for it. Lists are saved per account; registration is invite-only.

The spec is in [docs/spec.html](docs/spec.html) and the design mockups are in [docs/mockups](docs/mockups). The original single-page version is kept in [legacy/index.html](legacy/index.html).

## Stack

SvelteKit 3 (TypeScript) on Node, SQLite via better-sqlite3 + Drizzle, Google sign-in via Arctic, Valibot for validation, idb-keyval for the browser cache and fflate for zips. Requires Node 22.17 or newer.

All Modrinth requests and jar downloads happen in the browser. The server only stores accounts and lists, so it never hits Modrinth's rate limits and never sends jar files over your upload.

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173. In dev mode the sign-in page has a **Dev only** form that signs you in as a named test account without Google. The first account becomes admin.

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Unit tests for the parser, side rules, matrix, dependency resolution and diffs |
| `npm run check` | Type-check |
| `npm run db:generate -- --name <change>` | Create a migration after editing `src/lib/server/db/schema.ts` (migrations run on startup) |
| `npm run build` | Production build into `build/` |

## Google sign-in

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**.
2. Add the authorized redirect URI `<origin>/login/google/callback`, for example `https://matrix.example.com/login/google/callback` (and `http://localhost:5173/login/google/callback` for development).
3. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Set `ADMIN_EMAIL` to your Google address so you become admin on first sign-in. Without it, the first account to sign in becomes admin.

Everyone else needs an invite link from the **Admin** page.

## Deploying on the home lab

```bash
docker compose up -d --build
```

Before the first start, edit `ORIGIN` in `docker-compose.yml` to your public URL and fill in `.env`. The database lives in the `matrix-data` volume at `/data/app.db`. The container listens on `127.0.0.1:3000`, so it's only reachable through nginx.

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name matrix.example.com;
    # ssl_certificate ... (e.g. from certbot)

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The app already serves its JS and CSS pre-compressed (brotli/gzip) with long-lived `immutable` cache headers, so each browser downloads the bundle once.

### Backups

Copy the database while the app runs, using SQLite's online backup:

```bash
docker compose exec app node -e "require('better-sqlite3')('/data/app.db').backup('/data/backup.db')"
docker compose cp app:/data/backup.db ./backup-$(date +%F).db
```

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file path (default `data/app.db`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client. Sign-in is disabled without them |
| `ADMIN_EMAIL` | Google account that becomes admin without an invite |
| `ORIGIN` | Public URL, required behind a proxy |
| `ADDRESS_HEADER`, `XFF_DEPTH` | Client IP from nginx, used for rate limiting sign-in |

## Code layout

```
src/lib/core/      Pure logic shared by browser and server (text format, sides, matrix, downloads, diff) + tests
src/lib/client/    Browser-only: Modrinth API with IndexedDB cache, zip building, localStorage helpers
src/lib/server/    Database schema, sessions, accounts and invites, list storage and permissions
src/lib/components Sidebar, matrix view, download dialog, list form
src/routes/        Pages: dashboard, scratch matrix, lists (view/edit/history/export), admin, login, invite
drizzle/           SQL migrations, applied on startup
```
