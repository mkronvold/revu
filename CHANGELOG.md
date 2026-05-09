# Changelog

## Unreleased
- Added multi-stage Docker images for the API and web app
- Added GitHub Actions image publishing to GHCR
- Split Docker Compose into deployment defaults plus a source-development override
- Tightened Docker Compose port exposure and added service health checks
- Added Docker Compose service aliases and external proxy network wiring
- Renamed Docker Compose containers to the `revu-*` convention
- Ignored editor backup and Office document artifacts
- Removed tracked backup and Office source files from the repository
- Added `up.sh` and `down.sh` helpers for deployment compose lifecycle

## 0.1.0 - 2026-05-08
- Initial Revu application baseline
- Added API-first TypeScript monorepo with Fastify API, React/Vite web app, and shared contracts
- Implemented auth, employee admin, review period/question/assignment admin, and assessment/review workflows
- Added root documentation, local workflow scripts, and validation commands
