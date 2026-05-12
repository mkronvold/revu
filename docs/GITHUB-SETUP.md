# GitHub setup for Revu automation

This repo relies on a few GitHub repository settings for Dependabot automerge, GHCR publishing, and branch cleanup.

## Required repository settings

### 1. Allow workflows to write and approve PRs

Path: `Settings -> Actions -> General`

- Make sure GitHub Actions is enabled for the repository.
- Under `Workflow permissions`, allow write-capable workflows to operate.
- Turn on `Allow GitHub Actions to create and approve pull requests`.

Why this matters:

- `.github/workflows/automerge-dependencies.yml` needs write access to approve eligible Dependabot PRs and enable auto-merge.
- `.github/workflows/publish-images.yml` and `.github/workflows/refresh-images.yml` publish images to GHCR and need write-capable workflow tokens for package publishing.

### 2. Allow PR auto-merge

Path: `Settings -> General -> Pull Requests`

- Turn on `Allow auto-merge`.

Why this matters:

- Eligible Dependabot patch and minor updates are set to auto-merge by `.github/workflows/automerge-dependencies.yml`.
- Without this setting, the workflow can prepare the PR but GitHub will not complete the merge.

### 3. Automatically delete merged branches

Path: `Settings -> General -> Pull Requests`

- Turn on `Automatically delete head branches`.

Why this matters:

- After a Dependabot PR merges into `main`, GitHub can remove the `dependabot/...` branch automatically without human cleanup.

## Recommended safety setting

### Protect `main` with required checks

Path: `Settings -> Branches`

If you use branch protection for `main`, require at least:

- `validate`

Optional:

- the PR Docker build jobs from `publish-images.yml`

Why this matters:

- Dependabot auto-merge should wait for the same validation gate humans rely on.
- This keeps automerge fast for safe updates while still blocking broken changes.

## If Actions policy is restricted

Path: `Settings -> Actions -> General`

If the repository is not set to allow all marketplace actions, make sure the workflow policy allows the actions used here, including:

- `actions/*`
- `docker/*`
- `dependabot/fetch-metadata`
- `hmarr/auto-approve-action`
- `peter-evans/enable-pull-request-automerge`

Without those, the publishing and automerge workflows will not run correctly.
