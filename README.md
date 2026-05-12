# Revu

Revu is an API-first TypeScript monorepo for employee assessments, workflow follow-up, and review-period administration.

Revu provides a dashboard-led workflow for self and peer assessments, manager/admin acceptance and scheduling, reviewer conclusions, and admin oversight for review periods, employees, question sets, assignments, workflow content, and backups.

## Feature showcase

- **Assessment lifecycle** from `new` through `draft`, `submitted`, `accepted`, `ready_for_meeting`, `scheduled`, and `concluded`
- **Role-aware workflow surfaces** for employees, managers, reviewers, and admins
- **Admin controls** for review periods, employees, question sets, assignments, workflow content, and assessment overrides
- **File management** for backups plus JSON/CSV import and export flows
- **PostgreSQL-backed persistence** for development, testing, and deployment
- **Published deployment images** at `ghcr.io/mkronvold/revu-api` and `ghcr.io/mkronvold/revu-web`
- **Lifecycle automation** for Dependabot, GHCR publishing, scheduled image refreshes, and host-side auto-update

## Documentation index

### Start here

| Document | Purpose |
| --- | --- |
| [`docs/QUICKSTART.md`](docs/QUICKSTART.md) | Fast deployment path: clone the repo, edit `.env`, and run `./up.sh`. |
| [`docs/NPM.md`](docs/NPM.md) | Configure Docker networking and Nginx Proxy Manager for a reverse-proxy deployment. |
| [`docs/WORKFLOW.md`](docs/WORKFLOW.md) | Understand the assessment-to-review lifecycle, states, and roles. |

### Administration

| Document | Purpose |
| --- | --- |
| [`docs/ADMIN.md`](docs/ADMIN.md) | What admins do before, during, and after a review cycle, plus where each admin function lives. |
| [`docs/FILEMANAGEMENT.md`](docs/FILEMANAGEMENT.md) | Backups, stored backup archive behavior, restore scopes, and import/export functions. |

### Operations and lifecycle

| Document | Purpose |
| --- | --- |
| [`docs/LCM.md`](docs/LCM.md) | Dependency automation, image refreshes, GHCR publishing, and redeploy behavior. |
| [`docs/GITHUB-SETUP.md`](docs/GITHUB-SETUP.md) | Required GitHub repository settings for automerge, GHCR publishing, and branch cleanup. |

### Development and reference

| Document | Purpose |
| --- | --- |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Current app state, source-development notes, scripts, demo accounts, and developer reminders. |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Release notes and recent implementation history. |
| [`docs/GOAL.md`](docs/GOAL.md) | Original product goal and early workflow sketch. |
