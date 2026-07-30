# Revu CI and security validation

## Purpose

This document describes pull-request and release validation gates for Revu. Operational refresh cadence, host auto-update, and deployment consumption live in [`LCM.md`](./LCM.md). Operator start/stop/auto-refresh scripts live in [`DOCKER.md`](./DOCKER.md).

## Required local commands

| Command                | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `npm ci`               | Deterministic install from the committed lockfile        |
| `npm run lint`         | ESLint across the workspace                              |
| `npm run format:check` | Prettier check (use `npm run format` to apply)           |
| `npm test`             | Workspace Vitest suites                                  |
| `npm run typecheck`    | TypeScript checks across workspaces                      |
| `npm run build`        | Production builds for contracts, API, and web            |
| `npm run validate`     | `lint` → `format:check` → `test` → `typecheck` → `build` |

CI and image builds must use `npm ci`, not a floating install.

## Workflows

### `publish-images.yml`

Runs on pull requests, pushes to `main`, version tags, and manual dispatch.

1. **validate**
   - Node 26
   - `npm ci`
   - Apply SQL migrations against a Postgres 16 service
   - `npm run validate`
2. **build-and-publish** (matrix: `revu-api`, `revu-web`)
   - Multi-stage Docker build from the repository root
   - SBOM attached to the image build
   - Trivy image scan uploaded as SARIF with a distinct category per service
   - Push to GHCR is skipped on pull requests; enabled on `main`, tags, and dispatch

### `refresh-images.yml`

Weekly (and manual) rebuild of deployment tags (`latest`, `refresh-*`) so base-image CVE fixes can land after Dockerfile pin bumps and package updates. Uses the same validate → build/scan/publish shape as publish, without mutating SHA tags.

### `automerge-dependencies.yml`

Auto-approves and auto-merges eligible patch/minor Dependabot PRs when repository settings allow it. Major updates stay manual. See [`LCM.md`](./LCM.md) and [`GITHUB-SETUP.md`](./GITHUB-SETUP.md).

## Container scanning policy

| Stage                 | Behavior                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Now                   | Report-only Trivy SARIF upload per deployable service (`revu-api`, `revu-web`). Scans must not fail the job solely on finding severity. |
| After baseline triage | Enable reviewed severity gates; unresolved policy-severity findings block merge unless an approved exception exists.                    |
| Exceptions            | Record accepted risks in [`security/exceptions.md`](../security/exceptions.md) with ID, owner, rationale, mitigation, and expiry.       |

SBOM artifacts are produced with the image build so published contents remain traceable. Prefer scanning the image that was just built in the job; when publishing, retain the pushed tags/digests from the build metadata.

## Base images and digests

- Dockerfiles pin official images as `tag@sha256:digest`.
- Compose pins Postgres and the backup Node image the same way.
- Node **26** is the single supported major across `package.json` `engines`, CI `node-version`, API/web Dockerfiles, and the backup sidecar.
- Dependabot watches npm, GitHub Actions, and Dockerfiles under `apps/api` and `apps/web` weekly. Compose digest bumps are reviewed alongside Dockerfile pin updates.

## Node and package manager

| Surface              | Value                                  |
| -------------------- | -------------------------------------- |
| Node                 | `26.x` (`engines.node` `>=26.0.0`)     |
| npm                  | `>=11` (`packageManager` `npm@11.8.0`) |
| Install in CI/Docker | `npm ci`                               |

Temporary Node major mismatches are not allowed without a documented exception and removal date in `security/exceptions.md`.
