# Changelog

## Unreleased
- Added a Summer Nights theme and fixed Winter Nights dashboard overview contrast
- Simplified the Employees roster into single-line entries and localized password dialog/account timestamps
- Tightened the sidebar brand row, utility panel placement, signed-in card spacing, and global button height
- Replaced the sidebar light/dark toggle with a cycling multi-theme switcher and added Spring, Summer, Autumn, and Winter Nights palettes
- Fixed deployed runtime company-name branding so the sidebar title reads the current `.env` value instead of a cached default
- Refined the Reviews screen terminology, queue density, status display, and subjective response formatting
- Added a root `test.sh` helper to run the full workspace validation flow
- Reworked the dashboard, reviews, employees, questions, assignments, and archive admin screens into the new single-column, collapsible layouts
- Wired the web login flow into backend-enforced password reset and password change handling
- Added local user import/export UI for the new backend contracts, including export warnings and one-time passcode messaging
- Added a persisted dark mode toggle to the sidebar
- Added multi-stage Docker images for the API and web app
- Added GitHub Actions image publishing to GHCR
- Split Docker Compose into deployment defaults plus a source-development override
- Tightened Docker Compose port exposure and added service health checks
- Added Docker Compose service aliases and external proxy network wiring
- Renamed Docker Compose containers to the `revu-*` convention
- Moved the external proxy network attachment to `revu-web` and kept the API internal
- Updated the web nginx proxy target to use the internal `revu-api` service alias
- Made deployed web branding read `VITE_COMPANY_NAME` at container startup
- Added company-name branding from `VITE_COMPANY_NAME` and made the workspace title link home
- Updated `up.sh` to fast-forward from git and reconcile `.env` keys against `.env.example`
- Ignored editor backup and Office document artifacts
- Removed tracked backup and Office source files from the repository
- Added `up.sh` and `down.sh` helpers for deployment compose lifecycle

## 0.1.0 - 2026-05-08
- Initial Revu application baseline
- Added API-first TypeScript monorepo with Fastify API, React/Vite web app, and shared contracts
- Implemented auth, employee admin, review period/question/assignment admin, and assessment/review workflows
- Added root documentation, local workflow scripts, and validation commands
