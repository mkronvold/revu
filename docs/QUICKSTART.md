# Revu quick start

This is the shortest deployment path for bringing up Revu from the published images.

If you are deploying behind Nginx Proxy Manager, read [`NPM.md`](./NPM.md) before step 4.

## Prerequisites

- Git
- Docker with Docker Compose
- a host that can reach GHCR

## Step-by-step

1. Clone the repository:

   ```bash
   git clone https://github.com/mkronvold/revu.git
   cd revu
   ```

2. Copy the sample environment file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` for your environment.

   At minimum, review:

   - `VITE_COMPANY_NAME`
   - `POSTGRES_DB`
   - `POSTGRES_USER`
   - `POSTGRES_PASSWORD`
   - `PROXY_NET_NAME` if you are using a shared reverse-proxy network
   - backup settings if you want automatic backups enabled at launch

4. If you are deploying behind Nginx Proxy Manager, create or confirm the shared Docker network first.

   See [`NPM.md`](./NPM.md) for the exact network and proxy-host setup.

5. If the repo or packages are private on your host, authenticate Docker to GHCR:

   ```bash
   echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
   ```

6. Start the stack:

   ```bash
   ./up.sh
   ```

7. Stop the stack later with:

   ```bash
   ./down.sh
   ```

## What `./up.sh` does

`./up.sh`:

- fast-forwards the checkout from git
- reconciles `.env` keys against `.env.example`
- pulls deployment images
- applies database migrations
- seeds the example dataset if the database is still empty
- starts the deployment stack

## Important deployment note

The base deployment compose file is designed for reverse-proxy use and keeps the web, API, and database off host-published ports.

If you need direct host access instead of a reverse proxy, use a separate compose override rather than changing the base deployment definition.
