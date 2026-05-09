# Revu

Revu is an API-first TypeScript monorepo for employee assessments, manager/admin review workflows, and review-period administration.

## Current app state

- API and web foundations are in place for auth, employee admin, review periods, question sets, assignments, assessments, and manager/admin review actions.
- The API currently serves seeded in-memory demo data for local workflow development. Restarting the API resets that data.
- PostgreSQL migrations in `prisma/migrations/` define the intended schema and can be applied locally for schema validation and future persistence work.
- Question-set and assignment export routes return metadata stubs today; matching import routes acknowledge supported formats but are still `not_implemented`.
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

   The helper pulls the latest git changes first, compares `.env.example` to your local `.env`, and offers to add newly introduced keys or remove keys that no longer exist before it pulls images and starts Compose.

   To stop the deployment stack later:

   ```bash
   ./down.sh
   ```

   This uses `docker-compose.yml` as the deployment definition, keeps PostgreSQL and the API internal to the Compose network, and serves the web UI on `http://localhost:3000`. The database is reachable inside Compose as `revu-postgres`, the frontend is reachable as `revu-web` on both the default network and the external `nginxproxy_proxy-net` network, and the API stays internal as `revu-api` on the default network only. The published web image proxies `/api/*` requests to the `api` service inside Compose, so Nginx Proxy Manager only needs to target `revu-web:3000`.

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
| `./up.sh` | Fast-forwards from git, reconciles `.env` keys against `.env.example`, then pulls images and starts the deployment stack. |
| `./down.sh` | Stops the deployment stack. |
| `npm run db:up` | Starts only the Postgres service. |
| `npm run db:migrate` | Applies SQL files from `prisma/migrations/` to the local Postgres container. |
| `npm run db:down` | Stops Compose services. |
| `npm test` | Runs all workspace tests. |
| `npm run typecheck` | Runs TypeScript checks across workspaces. |
| `npm run build` | Builds all workspaces. |
| `npm run validate` | Runs tests, typecheck, and build in sequence. |
| `npm run compose:config` | Verifies Docker Compose configuration renders cleanly. |
| `npm run compose:config:dev` | Verifies the development compose override renders cleanly. |

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
- `.env.example` defaults `DATABASE_URL` to the Compose network host (`db`). If you run API tooling directly on the host instead of in Compose, switch that hostname to `localhost`.
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
