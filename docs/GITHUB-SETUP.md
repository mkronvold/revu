# GitHub setup for Revu automation

This repo relies on a few GitHub repository settings for Dependabot automerge, GHCR publishing, Lane B base-image CVE digests, and branch cleanup.

## Required repository settings

### 1. Allow workflows to write and approve PRs

Path: `Settings -> Actions -> General`

- Make sure GitHub Actions is enabled for the repository.
- Under `Workflow permissions`, set **Read and write permissions** (not read-only).
- Turn on `Allow GitHub Actions to create and approve pull requests`.

Why this matters:

- `.github/workflows/automerge-dependencies.yml` needs write access to approve eligible Dependabot PRs and enable auto-merge.
- `.github/workflows/base-image-cve-fix.yml` opens digest-fix PRs; `.github/workflows/automerge-base-image-cve.yml` approves/auto-merges crit/high ones.
- `.github/workflows/publish-images.yml` and `.github/workflows/refresh-images.yml` publish images to GHCR and need write-capable workflow tokens for package publishing.

### 2. Allow PR auto-merge

Path: `Settings -> General -> Pull Requests`

- Turn on `Allow auto-merge`.

Why this matters:

- Eligible Dependabot patch and minor updates are set to auto-merge by `.github/workflows/automerge-dependencies.yml`.
- Crit/high Lane B base-image digest PRs are set to auto-merge by `.github/workflows/automerge-base-image-cve.yml`.
- Without this setting, the workflow can prepare the PR but GitHub will not complete the merge.

### 3. Automatically delete merged branches

Path: `Settings -> General -> Pull Requests`

- Turn on `Automatically delete head branches`.

Why this matters:

- After a Dependabot PR merges into `main`, GitHub can remove the `dependabot/...` branch automatically without human cleanup.

### 4. Bot token so digest PRs run CI (required for hands-off Lane B)

Path: `Settings -> Secrets and variables -> Actions`

- Add repository secret `REVU_BOT_TOKEN` (fine-scoped PAT or GitHub App installation token) with:
  - Repository access to this repo only (recommended)
  - **Contents**: Read and write
  - **Pull requests**: Read and write
  - **Metadata**: Read (automatic)
- `base-image-cve-fix` uses `REVU_BOT_TOKEN` for checkout and `create-pull-request`. It falls back to `GITHUB_TOKEN` when unset, but PRs created with `GITHUB_TOKEN` often **do not** trigger further workflows (`pull_request` / `pull_request_target`). Auto-merge then never enrolls and CI may never run.

Why this matters:

- Digest PRs must still run `publish-images` / `validate` and fire `automerge-base-image-cve`.

### 5. Do not block first-party bot workflow runs

Path: `Settings -> Actions -> General`

- Avoid requiring manual **Approve and run** for every new workflow run from trusted first-party actors used by this repo (the account behind `REVU_BOT_TOKEN`, Dependabot, etc.).
- If a run lands in `action_required`, approve it once for that actor, then confirm later PRs start automatically.
- Fork PR approval policies are less relevant for same-repo bot branches, but a strict "require approval for all outside collaborators / first-time contributors" setting can still strand bot CI.

Why this matters:

- Lane B #103 sat in `action_required` until a human approved `publish-images`, which breaks hands-off merge.

### 6. Protect `main` with required checks (required for safe hands-off)

Path: `Settings -> Branches` (classic protection) or **Rulesets**

Require at least:

- Status check: **`validate`** (job from `publish-images.yml`)

Recommended:

- Do not require up-to-date branches unless you want every PR rebased before merge (`strict` off is fine for solo automation).
- Optional later: Docker build jobs from `publish-images.yml` (names are long/matrix-derived; prefer `validate` only unless you pin stable check names).

Why this matters:

- Auto-merge should wait for the same validation gate humans rely on.
- Without required checks, GitHub may merge as soon as auto-merge is enabled even when CI has not finished (or never started).

## Manual re-enrollment

- Patch/minor Dependabot PR missed automerge: run workflow **`automerge-dependencies`** with the PR number.
- Crit/high Lane B digest PR missed automerge: run workflow **`automerge-base-image-cve`** with the PR number.
  - Re-enroll **directly** approves and enables squash auto-merge after digest-only verification (it does not rely on close/reopen with `GITHUB_TOKEN`).

## If Actions policy is restricted

Path: `Settings -> Actions -> General`

If the repository is not set to allow all marketplace actions, make sure the workflow policy allows the actions used here, including:

- `actions/*`
- `docker/*`
- `dependabot/fetch-metadata`
- `hmarr/auto-approve-action`
- `peter-evans/enable-pull-request-automerge`
- `peter-evans/create-pull-request`
- `aquasecurity/trivy-action`
- `aquasecurity/setup-trivy`
- `github/codeql-action/*`

Without those, the publishing, scan, and automerge workflows will not run correctly.
