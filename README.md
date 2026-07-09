# Geektastic MCP Server

A self-hosted **MCP (Model Context Protocol) server** with a **Web management UI** that
exposes the **Geektastic Realms** application to MCP clients (Claude Desktop/Code and
others). Deploys as a Docker stack via **Portainer**, and is architected so additional
applications can be plugged in over time.

- **Integration:** Geektastic Realms REST/HTTP API
- **Stack:** TypeScript full-stack (Node + `@modelcontextprotocol/sdk` backend, React UI)
- **MCP transport:** Streamable HTTP (remote clients, bearer-token auth)
- **Storage:** PostgreSQL (Prisma ORM)
- **Access:** multi-user Web login with roles (admin + member), admin-managed accounts
- **Web UI:** connections & secrets, per-tool enable/disable, logs & monitoring, tool
  testing playground, user management

See **[ROADMAP.md](ROADMAP.md)** for the full architecture, data model, and phased
delivery plan.

## Documentation

- **[Docs/](Docs/README.md)** — the end-user & administrator manual: getting started,
  the admin guide (connections, tools, tokens, OAuth clients, users), the user guide,
  connecting an MCP client, the Geektastic Realms tools reference, and troubleshooting.
- **[Tech_Docs/](Tech_Docs/README.md)** — engineering reference: architecture, data
  model, API reference, the MCP protocol implementation, OAuth 2.1, security, the
  connector SDK, deployment, and local development.

## Status

Deployed and running (see [CHANGELOG.md](CHANGELOG.md) for the release history: the
initial scaffold, OAuth 2.1 support for Claude Desktop/Claude.ai, and a CSRF/session
fix). The Geektastic Realms connector is implemented against the real `/api/v1/*` API
(see `geektastic-realms/Docs/API.md`) — statblocks, campaigns, generic lore entries
(any category, with custom fields), and adventure modules (Acts/Chapters/Scenes/
Appendices, Encounters, Handouts). See **[ROADMAP.md](ROADMAP.md)** for the full tool
list and what's still ahead (Roll Tables aren't exposed yet).

## Repository layout

```
apps/server/       Node + Express backend: /api (management) and /mcp (Streamable HTTP)
apps/web/           React + Vite admin UI (built into apps/server/public)
packages/shared/    Types shared between server and web
packages/connectors/ AppConnector abstraction + the Geektastic Realms connector
```

## Getting started

1. Copy the env template and fill in real values:
   ```
   cp .env.example .env
   ```
   Generate `APP_ENCRYPTION_KEY` with `openssl rand -hex 32`, and a long random
   `SESSION_SECRET`. Set a real `ADMIN_PASSWORD` — it's only used to seed the first
   admin account on first run. Set `PUBLIC_BASE_URL` to this server's own
   externally-reachable origin (e.g. `https://mcp.example.com`) — required for OAuth
   discovery metadata (see "Connecting an MCP client" below).

2. Install dependencies (requires Node 22+ and pnpm; `corepack enable` will provide pnpm):
   ```
   pnpm install
   ```

3. Generate the Prisma client and sync the schema to your Postgres instance:
   ```
   pnpm prisma:generate
   pnpm prisma:push
   ```
   > No Prisma migrations are checked in yet — see **Known gaps** below.

4. Run the server and web UI in dev mode (two terminals):
   ```
   pnpm dev:server
   pnpm dev:web
   ```
   The web dev server proxies `/api` and `/health` to `localhost:8080` (see
   `apps/web/vite.config.ts`).

5. Or build and run everything as it will run in Docker:
   ```
   pnpm build
   pnpm --filter @geektastic/server start
   ```

## Docker / Portainer deployment

```
docker compose up -d --build
```

This builds the multi-stage `Dockerfile` (`node:22-alpine`) and starts it alongside the
official `postgres:16-alpine` image, per `docker-compose.yml`. Import the same
`docker-compose.yml` into Portainer as a Stack, and set the env vars from `.env.example`
in the stack's environment section. `pgdata` is a named volume, so config/secrets/users
persist across redeploys.

## Connecting an MCP client

First, log in to the Web UI with the bootstrap admin and add a Geektastic Realms
connection under **Connections**.

**Claude Code CLI** — uses a static Bearer token. Create one under **Tokens** (shown
once, copy it), then:
```
claude mcp add --transport http geektastic https://<host>/mcp \
  --header "Authorization: Bearer <token>"
```

**Claude Desktop / Claude.ai (Custom Connector)** — these only support OAuth 2.1, not a
raw header. Add a Custom Connector pointed at `https://<host>/mcp`; the server supports
Dynamic Client Registration, so Claude should register itself automatically and prompt
you to log in and approve access — no manual "OAuth Client ID" needed in the common
case. If a connector's setup screen doesn't attempt DCR and asks you to fill in a Client
ID manually, create one under **OAuth Clients** (name + Claude's redirect URI,
`https://claude.ai/api/mcp/auth_callback`) and paste the generated Client ID in.

`scripts/verify-oauth.sh <host> <admin-username> <admin-password>` simulates the full
OAuth flow via curl if you want to sanity-check the server side without a Claude.ai
account.

## Known gaps / next steps

- **No Prisma migration history yet.** The container currently runs `prisma db push` on
  startup instead of `prisma migrate deploy` (see the note in `Dockerfile`). Once the
  schema is validated against a real database, run `prisma migrate dev --name init`
  locally and commit the generated `apps/server/prisma/migrations/` folder, then switch
  the Dockerfile back to `migrate deploy` for safer, trackable schema changes.
- **Nothing has been `pnpm install`ed, type-checked, or run.** Expect some rough edges
  (dependency versions, minor type errors) on the first real build — this was scaffolded
  without running installers, per the plan.
- **No automated tests yet.**
