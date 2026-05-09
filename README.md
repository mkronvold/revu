# Revu

Revu is an API-first TypeScript monorepo for employee assessments, manager/admin review workflows, and review-period administration.

## Current app state

- API and web foundations are in place for auth, employee admin, review periods, question sets, assignments, assessments, and manager/admin review actions.
- The API currently serves seeded in-memory demo data for local workflow development. Restarting the API resets that data.
- PostgreSQL migrations in `prisma/migrations/` define the intended schema and can be applied locally for schema validation and future persistence work.
- Question-set and assignment export routes return metadata stubs today; matching import routes acknowledge supported formats but are still `not_implemented`.

## Requirements

- Node.js 22+
- npm 10+
- Docker with Docker Compose

## Quick start

1. Install workspace dependencies:

   ```bash
   npm install
   ```

2. Optional: copy the sample environment file if you want to override local ports or database credentials for Docker Compose:

   ```bash
   cp .env.example .env
   ```

3. Validate the workspace before starting development:

   ```bash
   npm run validate
   ```

4. Start the full local stack with Docker Compose:

   ```bash
   npm run dev
   ```

   This starts:
   - PostgreSQL on `localhost:5432` by default
   - API on `http://localhost:4000` by default
   - Web on `http://localhost:3000` by default

   Override those defaults by copying `.env.example` to `.env` and editing the values there. If you change `API_PORT`, also update `VITE_API_BASE_URL` so the browser keeps calling the right API origin.

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
  VITE_API_BASE_URL=http://localhost:4000 npm run dev:web
  ```

The direct workspace commands are useful for frontend or API-only iteration after `npm install`.

## Local scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Starts `db`, `api`, and `web` with Docker Compose. |
| `npm run dev:api` | Runs the API workspace in watch mode on the host. |
| `npm run dev:web` | Runs the Vite web workspace on the host. |
| `npm run db:up` | Starts only the Postgres service. |
| `npm run db:migrate` | Applies SQL files from `prisma/migrations/` to the local Postgres container. |
| `npm run db:down` | Stops Compose services. |
| `npm test` | Runs all workspace tests. |
| `npm run typecheck` | Runs TypeScript checks across workspaces. |
| `npm run build` | Builds all workspaces. |
| `npm run validate` | Runs tests, typecheck, and build in sequence. |
| `npm run compose:config` | Verifies Docker Compose configuration renders cleanly. |

## Demo accounts

The current API boots with seeded demo users for end-to-end workflow testing:

| Role | Username | Password |
| --- | --- | --- |
| Admin | `ada.admin` | `AdminPass123!` |
| Manager | `manny.manager` | `ManagerPass123!` |
| Employee | `elliot.employee` | `EmployeePass123!` |
| Peer reviewer | `pat.peer` | `PeerPass123!` |

These credentials are for local development only and live in the in-memory demo store.

## Database notes

- `DATABASE_URL` is used by the containerized API configuration and future persistence work.
- The running API does not write the seeded demo workflows into Postgres yet.
- If you need a clean local schema, run:

  ```bash
  docker compose down -v && npm run db:migrate
  ```

## Import/export status

- Question sets:
  - `GET /api/v1/review-periods/:id/question-sets/export?format=json|csv`
  - `POST /api/v1/review-periods/:id/question-sets/import`
- Assignments:
  - `GET /api/v1/review-periods/:id/assignments/export?format=json|csv`
  - `POST /api/v1/review-periods/:id/assignments/import`

Current behavior:

- export endpoints return typed stub metadata describing what would be exported
- import endpoints return `status: "not_implemented"`
- employee import/export flows are not exposed yet
