# Revu lifecycle management

## Purpose

This document explains how Revu keeps its published images and deployed containers fresh for CVE mitigation, what is refreshed automatically, and where source-controlled dependency updates are still required.

See also: [GitHub setup for Revu automation](./GITHUB-SETUP.md)

## Simple operating workflow

1. **One-time GitHub setup**
   - Enable the repository settings in [GITHUB-SETUP.md](./GITHUB-SETUP.md).
   - This is required for Dependabot automerge, GHCR publishing, and automatic branch cleanup.
2. **Automatic weekly dependency intake**
   - Dependabot checks weekly for npm, GitHub Actions, and Docker updates.
   - Safe patch and minor updates are auto-approved and set to auto-merge when repository settings allow it.
3. **Automatic publish after merge**
   - When a Dependabot PR merges into `main`, `publish-images.yml` validates the repo and publishes fresh `revu-api` and `revu-web` images to GHCR.
   - On the host, `autoupdate.sh` or a timer/service can pull and redeploy those updated images automatically.
4. **Automatic image refresh even without code changes**
   - `refresh-images.yml` runs weekly and rebuilds the published deployment images so base-image CVE fixes can land without a source commit.
5. **Manual path for major dependency updates**
   - Major Dependabot PRs are intentionally not auto-approved or auto-merged.
   - For each major PR, run the AI review prompt in this document, let the agent make any needed compatibility fixes, review the result, then approve and merge manually if it is still acceptable.

### Quick AI prompt for major Dependabot PRs

Use this prompt for each major Dependabot PR:

```text
Review Dependabot PR #<PR_NUMBER> in mkronvold/revu.

Goal:
- determine whether the major upgrade is safe to merge
- make any code, workflow, or test changes required for compatibility
- run the repo's existing validation commands
- give a final recommendation: approve, needs manual follow-up, or close/reject

Required work:
1. Read the PR diff and identify the dependency, old version, new version, and affected files.
2. Check upstream release notes/changelog for breaking changes relevant to this repo.
3. Inspect this codebase for impacted usage and update the code or workflows if needed.
4. Run the existing validation flow and any targeted tests needed to prove the upgrade works.
5. Summarize:
   - what changed
   - any compatibility fixes made
   - validation results
   - risks or follow-up items
   - whether the PR should be approved and merged

Constraints:
- do not invent new test tools
- do not weaken validation just to make the PR pass
- prefer precise fixes over broad refactors
```

## Revu LCM model

Revu uses two separate automation paths:

1. **Image refresh automation**
   - Rebuilds and republishes container images so they pick up:
     - refreshed base images
     - refreshed build-time or runtime packages installed during the Docker build
     - refreshed downloaded binaries or modules added by future Dockerfile steps
2. **Dependency update automation**
   - Updates source-controlled dependencies that are pinned in Git, such as:
     - npm packages in `package-lock.json`
     - GitHub Actions versions
     - Dockerfile tag changes that require source updates

These two paths solve different problems and should not be merged into one opaque “build whatever is latest” flow.

## Current image surfaces

- `apps/api/Dockerfile`
  - builder: `node:22-bookworm-slim`
  - runner: `node:22-bookworm-slim`
- `apps/web/Dockerfile`
  - builder: `node:22-bookworm-slim`
  - runner: `nginx:1.27-alpine`

Current app dependencies are installed with `npm ci`, which means published images use the exact versions committed in `package-lock.json`.

## What the scheduled image refresh does

The scheduled workflow `.github/workflows/refresh-images.yml` runs weekly by default and can also be started manually.

It rebuilds `revu-api` and `revu-web` with:

- `pull: true`
- `no-cache: true`

That means the refresh workflow picks up:

- newly published layers for `node:22-bookworm-slim`
- newly published layers for `nginx:1.27-alpine`
- any future `apt`, `apk`, `curl`, `wget`, or similar install steps added to Dockerfiles

It publishes moving deployment tags:

- `latest`
- `refresh-YYYYMMDD-HHMMSS`

It does **not** republish SHA tags, because a scheduled rebuild on the same Git commit should not mutate an immutable-looking tag.

## What the dependency automation does

Dependabot is configured in `.github/dependabot.yml` to check weekly for:

- npm dependencies
- GitHub Actions versions
- Dockerfile tag updates

Safe patch and minor Dependabot PRs are automatically approved and set to auto-merge by `.github/workflows/automerge-dependencies.yml`.

This keeps Git as the source of truth while still minimizing human involvement.

Major Dependabot PRs are not auto-approved. They should go through an AI-assisted review and validation pass before a human decides whether to approve and merge them.

### Important note about auto-merge

GitHub repository settings must allow **auto-merge** for the automerge workflow to complete the merge automatically.

If auto-merge is disabled in the repository settings:

- Dependabot PRs will still be created
- the workflow may approve them
- but GitHub will not complete the automatic merge step

See [GITHUB-SETUP.md](./GITHUB-SETUP.md) for the required repository settings, including:

- allowing GitHub Actions to create and approve pull requests
- allowing auto-merge
- automatically deleting merged head branches

### Manual review flow for major Dependabot PRs

Use this process for major updates:

1. Let Dependabot open the PR.
2. Run the major-upgrade AI prompt above against that PR.
3. Let the agent make any compatibility changes on the PR branch and run the existing repo validation.
4. Review the agent's summary and any code changes.
5. Approve and merge manually if the result is acceptable.
6. After merge, let `publish-images.yml` publish updated images from `main`.

## CVE mitigation boundaries

### Covered automatically by scheduled image refresh

- refreshed base-image packages inside the same Docker tag line
- refreshed OS packages installed during Docker builds
- refreshed downloaded binaries fetched during Docker builds

### Covered automatically by dependency PR automation

- npm dependency updates that require lockfile changes
- GitHub Actions version bumps
- Dockerfile tag changes when a newer source-level tag should be adopted

### Not covered automatically unless you add source automation for that ecosystem

- future Python, Go, Rust, Java, or other language dependencies added to the repo
- any dependency pinned outside `package-lock.json` and outside Dependabot coverage

If Revu adds another package ecosystem later, extend `.github/dependabot.yml` so that ecosystem is included instead of relying on image rebuilds alone.

## Publish and redeploy flow

### Build/publish

- `publish-images.yml`
  - runs on PR, push, tags, and manual dispatch
  - publishes normal CI/CD images
- `refresh-images.yml`
  - runs weekly by default
  - republishes fresh `latest` images even when app code does not change

### Host redeploy

- `up.sh`
  - updates the checkout
  - reconciles `.env`
  - pulls images
  - applies migrations
  - seeds the example dataset when needed
  - starts the stack
- `autoupdate.sh`
  - long-running mode watches GHCR and redeploys when published images change
  - `--once` runs a single check-and-redeploy pass for cron or systemd timers

## Recommended host automation

Use one of these depending on how the host is managed.

### Option 1: long-running service

This is the best fit when the host should continuously watch GHCR.

Example `systemd` unit:

```ini
[Unit]
Description=Revu image watcher
After=docker.service network-online.target
Wants=docker.service network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/revu
ExecStart=/bin/bash /opt/revu/autoupdate.sh 30
Restart=always
RestartSec=15

[Install]
WantedBy=multi-user.target
```

Then enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now revu-autoupdate.service
```

### Option 2: cron or one-shot timer

This is the best fit when the host prefers periodic jobs instead of a long-lived watcher.

Cron example:

```cron
*/30 * * * * cd /opt/revu && /bin/bash ./autoupdate.sh --once >> /var/log/revu-autoupdate.log 2>&1
```

`systemd` timer example:

```ini
[Unit]
Description=Revu one-shot image refresh

[Service]
Type=oneshot
WorkingDirectory=/opt/revu
ExecStart=/bin/bash /opt/revu/autoupdate.sh --once
```

```ini
[Unit]
Description=Run Revu one-shot image refresh every 30 minutes

[Timer]
OnBootSec=5m
OnUnitActiveSec=30m
Unit=revu-autoupdate-once.service

[Install]
WantedBy=timers.target
```

Then enable the timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now revu-autoupdate-once.timer
```

## Deployment decision points

### Reverse proxy versus direct host ports

Revu’s deployment compose file is intentionally kept off host-published ports for reverse-proxy deployments.

- Keep `docker-compose.yml` free of `ports:` when Revu sits behind Nginx Proxy Manager or another reverse proxy.
- If direct host access is required, add a separate compose override instead of changing the base deployment definition.

### Mutable deployment tags

`latest` is intentionally mutable in this setup so scheduled refresh builds can deliver refreshed images without a code change.

If you want stricter promotion controls:

- deploy from a dedicated release tag
- keep scheduled refresh publishing to a separate moving tag
- update the host deployment tag only after review

That is a stricter model, but it adds more operational steps.

## When to change this model

Revisit the LCM design if Revu starts doing any of the following:

- installs extra OS packages in Dockerfiles
- downloads third-party binaries during image builds
- adds new dependency ecosystems besides npm
- requires staged promotion instead of direct `latest` redeploys

When that happens, update this file and the corresponding GitHub automation so the documented LCM story remains true.
