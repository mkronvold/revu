# Revu with Nginx Proxy Manager

This guide explains how to place Revu behind Nginx Proxy Manager using the shared Docker network expected by the deployment compose file.

Official Nginx Proxy Manager resources:

- GitHub: <https://github.com/NginxProxyManager/nginx-proxy-manager>
- Docs: <https://nginxproxymanager.com/>

## Revu networking model

The deployment stack is intentionally set up like this:

- `revu-web` is reachable on the default Docker network and on the external proxy network
- `revu-api` stays internal to the default Compose network
- `revu-postgres` stays internal to the default Compose network

The web container proxies `/api/*` to the internal API service, so the reverse proxy only needs to target:

- host: `revu-web`
- port: `3000`

## 1. Install Nginx Proxy Manager

Follow the official Nginx Proxy Manager setup instructions for your host:

- <https://nginxproxymanager.com/guide/#docker-compose>

For a simple standalone install, that means running the NPM stack separately and exposing:

- port `80`
- port `81`
- port `443`

## 2. Create the shared Docker network

Revu defaults to the external network name:

- `nginxproxy_proxy-net`

Create it on the Docker host if it does not already exist:

```bash
docker network create nginxproxy_proxy-net
```

## 3. Attach Nginx Proxy Manager to that network

Whichever Compose file you use for Nginx Proxy Manager, make sure the NPM app container joins the same external network.

Example pattern:

```yaml
services:
  app:
    image: jc21/nginx-proxy-manager:latest
    networks:
      - default
      - proxy-net

networks:
  proxy-net:
    external: true
    name: nginxproxy_proxy-net
```

## 4. Match Revu's `.env`

Set or confirm these values in Revu's `.env`:

```dotenv
PROXY_NET_EXTERNAL=true
PROXY_NET_NAME=nginxproxy_proxy-net
```

If your shared network uses a different name, set `PROXY_NET_NAME` to that name instead.

## 5. Start Revu

From the Revu checkout:

```bash
./up.sh
```

After startup, `revu-web` should be attached to the shared proxy network and reachable from NPM by container name.

## 6. Create the proxy host in NPM

In the NPM admin UI:

1. Create a new Proxy Host.
2. Set the public domain name you want to use.
3. Set the forward host to `revu-web`.
4. Set the forward port to `3000`.
5. Configure SSL as needed, typically with Let's Encrypt.

Recommended result:

- public traffic terminates at NPM
- NPM forwards to `revu-web:3000`
- Revu web proxies API calls internally to `api:4000`

## Important notes

- Do not publish the API or database directly to host ports in the base deployment stack when using NPM.
- If you need direct host-port access for a non-proxy deployment, use a separate compose override.
- Revu's default proxy-network behavior is controlled entirely by `.env`, so keep the network name aligned between NPM and Revu.
