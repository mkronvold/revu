# Revu

Revu is an API-first TypeScript monorepo for employee assessments, manager/admin review workflows, and review-period administration.

## Current app state

- API and web foundations are in place for auth, employee admin, review periods, question sets, assignments, assessments, and manager/admin review actions.
- The API currently serves seeded in-memory demo data for local workflow development. Restarting the API resets that data.
- PostgreSQL migrations in `prisma/migrations/` define the intended schema and can be applied locally for schema validation and future persistence work.
- Question-set and assignment export routes return metadata stubs today; matching import routes acknowledge supported formats but are still `not_implemented`.
- Local user import/export is available from the employee admin UI. Exporting local users rotates every exported account to a generated one-time passcode and immediately signs those users out.
- GitHub Actions publishes deployment images to `ghcr.io/mkronvold/revu-api` and `ghcr.io/mkronvold/revu-web`.

## Requirements

- Node.js 22+
- npm 10+
- Docker with Docker Compose

## Quick start for source development

1. Install workspace dependencies:

   ```bash
   npm install
   ```

2. Optional: copy the sample environment file if you want to override local ports, branding, or database credentials:

   ```bash
   cp .env.example .env
   ```

3. Validate the workspace before starting development:

   ```bash
   npm run validate
   ```

4. Start the full local source stack with Docker Compose:

   ```bash
   npm run dev
   ```

   This starts the deployment compose file plus the `docker-compose.dev.yml` override:
   - PostgreSQL on `localhost:5432` by default
   - API on `http://localhost:4000` by default
   - Web on `http://localhost:3000` by default

   The dev compose override binds those ports to `127.0.0.1` so they stay local to the machine instead of being exposed on every interface. Override those defaults by copying `.env.example` to `.env` and editing the values there. `VITE_COMPANY_NAME` controls the company label shown next to the workspace title. The default web dev flow now uses same-origin `/api/v1` requests with a Vite proxy to the API container.

5. Apply SQL migrations to the local Postgres container when you need a real schema instance:

   ```bash
   npm run db:migrate
   ```

   The migration helper records applied files in a `schema_migrations` table so re-running it only applies new SQL files.

## Run services without Docker

- API:

  ```bash
  PORT=4000 npm run dev:api
  ```

- Web:

  ```bash
  VITE_API_BASE_URL=/api/v1 npm run dev:web
  ```

  The host `dev:web` command automatically proxies `/api` traffic to `http://localhost:4000` unless you override `VITE_PROXY_TARGET`.

The direct workspace commands are useful for frontend or API-only iteration after `npm install`.

## Deploy from GHCR

1. Copy the sample environment file:

   ```bash
   cp .env.example .env
   ```

2. Set the image names and tag you want to deploy. The defaults point at:

   - `ghcr.io/mkronvold/revu-api`
   - `ghcr.io/mkronvold/revu-web`
   - tag `latest`
   - external proxy network `nginxproxy_proxy-net`
   - baked-in web company label `Your Company`

3. If the repository or packages are private, authenticate the Docker host to GHCR before pulling:

   ```bash
   echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
   ```

4. Pull and start the deployment stack:

   ```bash
   ./up.sh
   ```

    The helper pulls the latest git changes first, compares `.env.example` to your local `.env`, and offers to add newly introduced keys or remove keys that no longer exist before it pulls images, applies database migrations, seeds the built-in example dataset only when the database is still empty, and starts Compose. The deployment stack now also starts a `backup` sidecar that keeps automatic backups in a dedicated archive volume, uses a separate handoff volume for backup download/upload and restore workflows, and shares a small config/status volume with the API.

   To stop the deployment stack later:

   ```bash
   ./down.sh
   ```

     This uses `docker-compose.yml` as the deployment definition, keeps PostgreSQL and the API internal to the Compose network, and serves the web UI on `http://localhost:3000`. The database is reachable inside Compose as `revu-postgres`, the frontend is reachable as `revu-web` on both the default network and the external `nginxproxy_proxy-net` network, and the API stays internal as `revu-api` on the default network only. The published web image proxies `/api/*` requests to the `api` service inside Compose, so Nginx Proxy Manager only needs to target `revu-web:3000`. `VITE_COMPANY_NAME` is applied at container startup, and the generated runtime config is served without browser caching, so changing it in `.env` takes effect after restarting the web container and refreshing the page. The same runtime config also carries the published image revision, which the sidebar shows in a compact Build card.

## Backup runtime

- The deployment compose file mounts three named backup volumes into the backup runtime:
  - `backup-archive` stores retained automatic backup files.
  - `backup-handoff` is reserved for download, upload, and restore handoff files.
  - `backup-config` stores the shared automatic-backup schedule and last-run status file.
- The `backup` sidecar runs `scripts/backup-entrypoint.sh scheduler` and reads the same backup settings the File Management page edits:
  - `BACKUP_AUTOMATIC_ENABLED` enables or disables scheduled backups.
  - `BACKUP_SCHEDULE` accepts `1hr`, `3hr`, `6hr`, `12hr`, `daily`, or `weekly`.
  - `BACKUP_RETENTION_COUNT` keeps the latest N archived backups.
- The API and backup sidecar both read and update `BACKUP_STATUS_PATH`, so the UI reflects the latest backup and restore timestamps from the shared config volume.
- The scheduler and helper scripts expect the API backup endpoints to be reachable at:
  - `BACKUP_DOWNLOAD_URL` (default `http://api:4000/api/v1/admin/backups/export`)
  - `BACKUP_RESTORE_URL` (default `http://api:4000/api/v1/admin/backups/restore`)
- If those endpoints need auth or an internal shared-secret header, set either:
  - `BACKUP_BEARER_TOKEN`
  - or `BACKUP_HEADER_NAME` plus `BACKUP_HEADER_VALUE`
- The current ops plumbing assumes the backup payload is a single file response, with JSON as the default extension (`BACKUP_FILE_EXTENSION=json`), and that restores accept multipart form fields named `file`, `target`, and `mode`.
- Useful manual helpers:

  ```bash
  ./scripts/backup-now.sh
  ./scripts/backup-download-handoff.sh latest
  ./scripts/backup-upload-handoff.sh /path/to/backup.json
  ./scripts/backup-restore.sh /path/to/backup.json questions
  ```

## Container publishing

- Workflow: `.github/workflows/publish-images.yml`
- Triggers:
  - pull requests run workspace validation plus Docker builds without pushing
  - pushes to `main`, version tags, and manual dispatch publish images to GHCR
- Published images:
  - `ghcr.io/mkronvold/revu-api`
  - `ghcr.io/mkronvold/revu-web`

## Local scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Starts `db`, `api`, and `web` from source with the dev compose override and a local-only proxy network. |
| `npm run dev:api` | Runs the API workspace in watch mode on the host. |
| `npm run dev:web` | Runs the Vite web workspace on the host. |
| `npm run deploy:pull` | Pulls the configured GHCR deployment images. |
| `npm run deploy:up` | Starts the deployment stack from published images. |
| `./up.sh` | Fast-forwards from git, reconciles `.env` keys against `.env.example`, pulls images, applies migrations, seeds the example dataset only when the database is empty, and starts the deployment stack. |
| `./down.sh` | Stops the deployment stack. |
| `./autoupdate.sh [minutes]` | Checks the GHCR-backed `api` and `web` images via GHCR manifest digests, pulls and restarts Compose only when either image changes, applies migrations, seeds the example dataset if the database is empty, and sleeps 30 minutes between checks by default. |
| `./scripts/backup-now.sh [name]` | Runs the backup sidecar on demand and stores a full backup in the retained archive volume. |
| `./scripts/backup-download-handoff.sh [backup\|latest] [request-id]` | Copies an archived backup into the shared download handoff area. |
| `./scripts/backup-upload-handoff.sh <file> [request-id]` | Copies an uploaded backup file into the shared upload handoff area. |
| `./scripts/backup-restore.sh <file> [target] [request-id]` | Calls the API restore endpoint with replace semantics for the requested target slice. |
| `./reset-to-example.sh` | Applies migrations and reloads Postgres with the exact example dataset used by development and tests. |
| `./test.sh` | Runs the full workspace validation flow (`npm run validate`). |
| `npm run db:up` | Starts only the Postgres service. |
| `npm run db:migrate` | Applies SQL files from `prisma/migrations/` to the local Postgres container and backfills migration history when the schema already exists. |
| `npm run db:down` | Stops Compose services. |
| `npm test` | Runs all workspace tests. |
| `npm run typecheck` | Runs TypeScript checks across workspaces. |
| `npm run build` | Builds all workspaces. |
| `npm run validate` | Runs tests, typecheck, and build in sequence. |
| `npm run compose:config` | Verifies Docker Compose configuration renders cleanly. |
| `npm run compose:config:dev` | Verifies the development compose override renders cleanly. |

## Demo accounts

The default example dataset includes seeded demo users for end-to-end workflow testing:

| Role | Username | Password |
| --- | --- | --- |
| Admin | `ada.admin` | `AdminPass123!` |
| Manager | `manny.manager` | `ManagerPass123!` |
| Employee | `elliot.employee` | `EmployeePass123!` |
| Peer reviewer | `pat.peer` | `PeerPass123!` |

These credentials are for local development only. They are stored in Postgres and restored by `./reset-to-example.sh`.

If a user signs in with a generated reset password or exported one-time passcode, the API allows `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`, and `POST /api/v1/auth/password/change` only until that user chooses a new password.

## Database notes

- `DATABASE_URL` is used by the API runtime, example seeding/reset helpers, and API tests.
- The running API persists employees, auth sessions, review periods, question sets, assignments, assessments, and responses in Postgres.
- `.env.example` defaults `DATABASE_URL` to the Compose network host (`db`). If you run API tooling directly on the host instead of in Compose, switch that hostname to `localhost`.
- Host-side API tests need a reachable Postgres instance that matches `DATABASE_URL`. The fallback is `postgresql://revu:revu@localhost:5432/revu`.
- To restore the exact example dataset used by development and tests, run:

  ```bash
  ./reset-to-example.sh
  ```

- If you need a clean local schema, run:

  ```bash
  docker compose down -v && npm run db:up && npm run db:migrate && ./reset-to-example.sh
  ```

## Import/export status

- Question sets:
  - `GET /api/v1/review-periods/:id/question-sets/export?format=json|csv`
  - `POST /api/v1/review-periods/:id/question-sets/import`
- Assignments:
  - `GET /api/v1/review-periods/:id/assignments/export?format=json|csv`
  - `POST /api/v1/review-periods/:id/assignments/import`
- Local users:
  - `GET /api/v1/employees/export?format=json|csv`
  - `POST /api/v1/employees/import`

Current behavior:

- export endpoints return typed stub metadata describing what would be exported
- import endpoints return `status: "not_implemented"`
- local user exports return import-ready payloads plus generated one-time passcodes
- local user imports upsert users, preserve the supplied `passwordResetRequired` flag, and invalidate sessions for imported accounts
- the Employees admin screen exports local users as direct `.json` or `.csv` downloads and imports from a browser-selected file with JSON/CSV autodetection
