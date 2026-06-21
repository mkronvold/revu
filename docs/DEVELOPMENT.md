# Revu development notes

This document collects developer-facing status, source-development steps, local scripts, and technical reminders that do not need to stay in the top-level README.

## Current app state

- API and web flows are in place for auth, employee admin, review periods, question sets, assignments, assessments, workflow settings, backups, and file transfers.
- The active assessment lifecycle is `new`, `draft`, `submitted`, `accepted`, `ready_for_meeting`, `scheduled`, and `concluded`.
- `Dashboard` is the operational workflow surface for employees, managers, reviewers, and day-to-day non-admin follow-up. The legacy `/reviews` route is gone.
- Admin `Assessments` remains the separate override and visibility surface for the active review period.
- The app persists to PostgreSQL for development, tests, and deployment; use `./reset-to-example.sh` to restore the seeded demo dataset.
- Local user, question-set, and assignment transfers support real JSON/CSV downloads plus browser-selected JSON/CSV imports from the File Management admin UI.
- Exporting local users rotates every exported account to a generated one-time passcode and immediately signs those users out.
- GitHub Actions publishes deployment images to `ghcr.io/mkronvold/revu-api` and `ghcr.io/mkronvold/revu-web`.

## Things to remember

- `Dashboard` is the shared workflow surface; admin `Assessments` is the override and visibility surface.
- The deployment stack is designed for reverse-proxy use. The base deployment compose file keeps web, API, and database off host-published ports.
- `VITE_COMPANY_NAME`, `VITE_ENABLE_QUESTION_SET_STATUS`, and `VITE_AUTO_REFRESH_INTERVAL_MS` are runtime-facing configuration values used in both development and deployment.
- The default deployment backup path uses the internal API endpoints for the backup sidecar; see [`FILEMANAGEMENT.md`](./FILEMANAGEMENT.md) and [`LCM.md`](./LCM.md) for the operational side.
- `npm run validate` is the main repo-wide validation command.

## Requirements

- Node.js 25+
- npm 11+
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

   The dev compose override binds those ports to `127.0.0.1` so they stay local to the machine instead of being exposed on every interface. Override those defaults by copying `.env.example` to `.env` and editing the values there. `VITE_COMPANY_NAME` controls the company label shown next to the workspace title, `VITE_ENABLE_QUESTION_SET_STATUS=false` hides question-set status controls and treats saved sets as active by default, and `VITE_AUTO_REFRESH_INTERVAL_MS=60000` controls the periodic data refresh cadence. The default web dev flow uses same-origin `/api/v1` requests with a Vite proxy to the API container.

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
| `./autoupdate.sh [minutes]` | Ensures the deployment stack is already running or starts it through `up.sh`, then checks the GHCR-backed `api` and `web` images via GHCR manifest digests, pulls and restarts Compose only when either image changes, applies migrations, seeds the example dataset if the database is empty, and sleeps 30 minutes between checks by default. |
| `./autoupdate.sh --once` | Runs a single GHCR check-and-redeploy pass so cron or a `systemd` timer can reuse the same logic without running a long-lived watcher. |
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

- question-set and assignment exports return import-ready JSON/CSV payloads for the selected review period
- question-set imports upsert sets in the selected review period by target plus title and preserve imported question ordering and content
- assignment exports include employee, manager, and assessor usernames so imports can resolve relationships across environments
- assignment imports upsert rows by employee username for the selected review period and keep employee manager and peer-reviewer relationships aligned
- local user exports support both `rotate-passcodes` and `preserve-passwords` modes
- `rotate-passcodes` exports return import-ready payloads plus generated one-time passcodes, mark exported accounts for password reset, and invalidate those users' current sessions
- `preserve-passwords` exports return stored password-hash credentials without rotating passwords or invalidating current sessions
- local user imports upsert users, preserve the supplied `passwordResetRequired` flag, and invalidate sessions for imported accounts
- the File Management admin screen exports direct `.json` or `.csv` downloads and imports from a browser-selected file for local users, question sets, and assignments
