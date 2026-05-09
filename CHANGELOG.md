# Changelog

## Unreleased
- Added multi-stage Docker images for the API and web app
- Added GitHub Actions image publishing to GHCR
- Split Docker Compose into deployment defaults plus a source-development override
- Ignored editor backup and Office document artifacts
- Removed tracked backup and Office source files from the repository

## 0.1.0 - 2026-05-08
- Initial Revu application baseline
- Added API-first TypeScript monorepo with Fastify API, React/Vite web app, and shared contracts
- Implemented auth, employee admin, review period/question/assignment admin, and assessment/review workflows
- Added root documentation, local workflow scripts, and validation commands
