# Revu Docker deployment scripts

## Purpose

Documents the host-side Compose deployment path for published GHCR images. Lifecycle automation and tag policy live in [`LCM.md`](./LCM.md). Fast path steps live in [`QUICKSTART.md`](./QUICKSTART.md).

## Artifacts

| Artifact                 | Role                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `docker-compose.yml`     | Production services: `db`, `api`, `web`, `backup` with health checks and digest-pinned third-party images      |
| `docker-compose.dev.yml` | Local source-development overrides (published ports, build contexts)                                           |
| `.env` / `.env.example`  | Host-local secrets and URLs; not the immutable release pin channel                                             |
| `up.sh`                  | Canonical start/restart: git fast-forward, env reconcile, pull, migrate, optional seed, `docker compose up -d` |
| `down.sh`                | Canonical stop                                                                                                 |
| `autoupdate.sh`          | GHCR digest watcher for `api` + `web`; restarts only through `up.sh`                                           |

## Channels

| Channel                     | Image reference                        | Update mechanism                                                                                        |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Home / operator Docker host | Mutable app tag such as `latest`       | `autoupdate.sh` compares local vs remote GHCR digests, pulls changed app services, restarts via `up.sh` |
| Reviewed / immutable        | `tag@sha256:digest` in version control | Human or CD applies a reviewed pin change                                                               |

Rules:

1. Auto-refresh is only for hosts that intentionally track a mutable app tag.
2. Publishing an image is not a deploy; host `up.sh` / `autoupdate.sh` perform deploy.
3. Rollback means redeploying a known-good tag or digest through `up.sh`.
4. Do not auto-refresh Postgres, reverse proxies, or the backup sidecar image on the app cadence. Only `api` and `web` are watched.

## `up.sh`

Use for every manual start or restart that should stay aligned with migrations and env keys:

```bash
./up.sh
```

Typical responsibilities:

- update the git checkout when appropriate
- reconcile `.env` keys against `.env.example`
- `docker compose pull` for configured images
- apply SQL migrations
- seed the example dataset only when the database is empty
- `docker compose up -d`

## `down.sh`

```bash
./down.sh
```

Stops the deployment stack cleanly.

## `autoupdate.sh`

```bash
./autoupdate.sh          # long-running watcher (default 30 minutes)
./autoupdate.sh 15       # custom interval minutes
./autoupdate.sh --once   # single check for cron/systemd timer
```

Behavior:

| Requirement   | Implementation                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Scope         | Watches Compose services `api` and `web` only                                                      |
| Detection     | Resolves image from `docker compose config`, compares local digest to GHCR `Docker-Content-Digest` |
| No-op         | Exit code `10` when no updates (timers may treat as success)                                       |
| Apply         | `docker compose pull <changed>` then restart only through `./up.sh`                                |
| Startup       | If required services are down, starts via `./up.sh` before monitoring                              |
| Concurrency   | `flock` serializes cycles; fails closed when another cycle holds the lock                          |
| Secrets       | Prefers `~/.docker/config.json`; optional `GHCR_USERNAME` / `GHCR_TOKEN`; never prints credentials |
| Observability | Timestamped logs; interactive `r` refresh; post-update health and digest logging                   |

### Host scheduling

Prefer one timer or service per Revu stack instance.

Cron:

```cron
*/30 * * * * cd /opt/revu && /bin/bash ./autoupdate.sh --once >> /var/log/revu-autoupdate.log 2>&1
```

See [`LCM.md`](./LCM.md) for full `systemd` unit and timer examples.

## Networking notes

- Base `docker-compose.yml` keeps app ports off the host for reverse-proxy deployments (`proxy-net`).
- Direct host access belongs in a separate override, not the base file.
- Nginx Proxy Manager setup: [`NPM.md`](./NPM.md).
