# Deployment

The intended deployment target is **Portainer**, importing `docker-compose.yml`
as a Stack, but the same compose file works with plain `docker compose` too.

## Dockerfile (`Dockerfile`) — multi-stage build

```
base     FROM node:22-alpine
           + apk add openssl                (Prisma's query engine needs it on musl)
           + npm install -g pnpm@11.10.0    (see "Corepack" note below)

deps     copies only package.json/pnpm-lock.yaml files, runs
           `pnpm install --frozen-lockfile` — cached across builds as long as
           dependencies don't change.

build    copies the full source, runs `prisma generate`, then the four-package
           build chain in dependency order:
           shared → connectors → web → server

runtime  FROM base (fresh, small image)
           installs prod-only deps (`pnpm install --prod --frozen-lockfile`)
           copies: apps/server/{dist,public,prisma,generated},
                    packages/{shared,connectors}/dist
           WORKDIR apps/server ; EXPOSE 8080
           CMD: prisma db push --skip-generate --accept-data-loss && node dist/index.js
```

**Why `npm install -g pnpm` instead of Corepack:** Corepack's
fetch-then-verify-signature activation flow repeatedly failed inside Docker
builds (`Cannot find matching keyid`, later a full activation failure) even
after upgrading Corepack itself. Installing pnpm as a plain global npm package
sidesteps that verification path. See `CHANGELOG.md` 1.0.0 for the full
debugging trail if this needs revisiting.

**Why `prisma db push` and not `prisma migrate deploy`:** no migration history
is checked into the repo yet (`apps/server/prisma/migrations/` doesn't exist).
`db push --accept-data-loss` syncs the live schema to `schema.prisma` directly
on every container start, without a migration audit trail, and can drop data
if a change is genuinely destructive. This is a known, explicitly-flagged gap
— see [Development → Known gaps](09-Development.md#known-gaps) for what
switching to real migrations involves.

**Build script requirement:** `pnpm-workspace.yaml` sets
`dangerouslyAllowAllBuilds: true` — pnpm 10+ blocks dependency
postinstall/build scripts (Prisma's query-engine download, esbuild's binary
fetch) by default unless approved via an interactive `pnpm approve-builds`
prompt, which can't run in a non-interactive Docker build. This flag is judged
acceptable for a private, self-hosted, single-operator deployment; a tighter
explicit `allowBuilds:` allowlist would be more conservative.

## docker-compose.yml — the Portainer stack

```yaml
services:
  mcp-server:
    build: .
    ports: ["8084:8080"]
    environment: { DATABASE_URL, APP_ENCRYPTION_KEY, SESSION_SECRET,
                    ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD,
                    PORT: 8080, NODE_ENV: production,
                    TRUST_PROXY, PUBLIC_BASE_URL }
    depends_on: { postgres: { condition: service_healthy } }
    restart: unless-stopped
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: mcp, POSTGRES_PASSWORD, POSTGRES_DB: mcp }
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck: pg_isready -U mcp -d mcp
    restart: unless-stopped
volumes: { pgdata }
```

- The app doesn't start until Postgres reports healthy (`depends_on:
  condition: service_healthy`).
- `pgdata` is a named volume — this is what makes users/connections/tokens/
  logs survive a redeploy or image update. **Never remove this volume** without
  intending to lose all server state.
- Host port `8084` maps to the container's `8080` in the checked-in compose
  file; change the left side of `ports` (or route through a reverse proxy) as
  needed for your environment.

## Environment variables

Validated at startup by `apps/server/src/env.ts` (Zod) — **the process
refuses to start** if any required var is missing or malformed, rather than
booting into a broken state.

| Var | Required | Validation | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | non-empty string | Postgres connection string |
| `APP_ENCRYPTION_KEY` | yes | exactly 64 hex chars (32 bytes) | AES-256-GCM key for encrypted credentials — generate with `openssl rand -hex 32` |
| `SESSION_SECRET` | yes | min 16 chars | `express-session` signing secret |
| `ADMIN_USERNAME` | no | default `"admin"` | bootstrap admin username (first run only) |
| `ADMIN_EMAIL` | no | default `"admin@example.com"`, must be a valid email | bootstrap admin email |
| `ADMIN_PASSWORD` | yes | min 8 chars | bootstrap admin password (first run only — see below) |
| `PUBLIC_BASE_URL` | yes | valid absolute URL, trailing slash stripped | this server's own externally-reachable origin; required for OAuth discovery metadata and the `iss` parameter |
| `PORT` | no | positive int, default `8080` | HTTP listen port |
| `NODE_ENV` | no | `development`\|`production`\|`test`, default `production` | standard Node env flag |
| `TRUST_PROXY` | no | `"true"`/anything else → boolean, default `false` | see below |

### `ADMIN_USERNAME`/`ADMIN_PASSWORD` — first run only

`auth/bootstrap.ts` checks `prisma.user.count()` on every startup; the admin
account is only seeded if the table is **empty**. Changing `ADMIN_PASSWORD` in
the environment after the first successful boot has **no effect** — the
account already exists. To change the bootstrap admin's password after the
fact, use the Web UI's Profile page (or another admin's **Users → Reset
password**), not the env var.

### `TRUST_PROXY`

Set this to `true` **only if and once** this server sits behind a
TLS-terminating reverse proxy (nginx, Caddy, Traefik, etc.) that forwards
`X-Forwarded-*` headers. It does two things: sets Express's `trust proxy`
setting, and — critically — flips the session cookie's `Secure` flag on (see
[Security → Sessions](06-Security.md#sessions-authsessionts)). Leaving it
`false` while actually running behind TLS is safe but suboptimal (cookie sent
unencrypted-flagged, though still over HTTPS in that scenario since the proxy
handles TLS termination); setting it `true` **without** a real HTTPS front end
means the browser will refuse to store the session cookie at all, and nobody
will be able to stay logged in past the login request itself.

### `PUBLIC_BASE_URL`

Must be this server's real, externally-reachable origin (e.g.
`https://mcp.example.com`), no trailing slash, no path. Used to build every
OAuth discovery URL and the `iss` parameter in the authorization response —
if this doesn't match what MCP clients actually reach the server at, OAuth
discovery and the `iss` check some clients perform will fail. Not used by the
static-token (Claude Code CLI) path at all.

## Startup sequence

1. `bootstrapAdmin()` — seed the initial admin if the `users` table is empty.
2. Express app assembled (see [Architecture → Request
   routing](01-Architecture.md#request-routing-appsserversrcindexts)).
3. `app.listen(PORT)`.

Any failure during this sequence (bad env, DB unreachable) logs `"Fatal
startup error:"` and calls `process.exit(1)` — the container will show as
crashed/restarting rather than serving a broken app, which is what
`docker-compose.yml`'s `restart: unless-stopped` will keep retrying.

## Reverse proxy / TLS

This server never terminates TLS itself. Put it behind your existing reverse
proxy for HTTPS + hostname routing, forward to the container's port, and set
`TRUST_PROXY=true` once that's in place. `/health` (unauthenticated, no DB
check) is suitable as the proxy's upstream health check.

## Verifying a deployment end-to-end

`ROADMAP.md`'s "Verification (end-to-end)" section is the authoritative
manual checklist (stack up → users/roles → connection → token/client → tool
call → toggle → playground → repeat on Portainer). `scripts/verify-oauth.sh
<host> <admin-username> <admin-password>` automates a curl-based walk through
the full OAuth flow (DCR → authorize → consent → token exchange → `/mcp` call
→ refresh rotation) against a real running deployment, useful for sanity-
checking the OAuth path without a real Claude.ai account.
