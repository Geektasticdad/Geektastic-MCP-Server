# Architecture

## System diagram

```
                 ┌──────────────────────────────────────────────┐
   MCP clients   │  Geektastic MCP Server (Node/TS container)    │
 (Claude, etc.)  │                                              │
  Bearer token ──┼─▶ /mcp   Streamable HTTP transport (MCP SDK)  │
                 │        │                                     │
 Admin browser ──┼─▶ /     React admin UI (static build)        │
   session cookie│   /api  Management REST API (role-guarded)   │
                 │        │                                     │
                 │        ▼                                     │
                 │   Connector Registry ──▶ GR Connector ──────┼──▶ Geektastic
                 │   (per-app tool sets)     (REST client)      │    Realms API
                 │        │                                     │
                 │        ▼                                     │
                 │   Prisma ORM                                 │
                 └────────┬─────────────────────────────────────┘
                          ▼
                 ┌──────────────────┐
                 │ Postgres (image) │  volume: pgdata
                 └──────────────────┘
```

One Node process serves everything on a single port (`8080` by default): the
compiled React SPA (static files), the `/api` management REST API, and the
`/mcp` MCP endpoint. The Portainer/Docker deployment is two containers: this
app, plus an official `postgres:16-alpine`.

## Request routing (`apps/server/src/index.ts`)

Route mounting order matters and is deliberate:

1. `GET /health` — unauthenticated liveness check (`{ ok: true }`).
2. `wellKnownRouter` (`/.well-known/oauth-authorization-server`,
   `/.well-known/oauth-protected-resource`) — mounted **before** session
   middleware and body parsing; must be reachable pre-auth by any client
   attempting OAuth discovery.
3. `/mcp` — mounted with its own `express.json()` and **before** the session
   middleware, because it authenticates via `Authorization: Bearer`, not a
   cookie, and must not depend on session state.
4. Global `express.json({ limit: "2mb" })` + `sessionMiddleware` — everything
   below this line has a parsed JSON body and `req.session`.
5. `express.urlencoded()` + `oauthRouter` — the OAuth token endpoint
   (`POST /oauth/token`) is form-urlencoded per RFC 6749, so `urlencoded()` is
   scoped here rather than applied globally (it would otherwise conflict with
   `/api`'s JSON bodies). `oauthRouter` declares its own full `/oauth/...`
   paths and is mounted at the root.
6. `apiRouter` at `/api` — the management REST API (session-cookie + role
   guarded).
7. `GET /oauth/consent` — an explicit route serving `index.html` before the SPA
   catch-all. `/oauth/consent` is a **client-side** React page (reached via a
   redirect from `GET /oauth/authorize`) rather than a server route, but the
   catch-all below explicitly excludes `/oauth/*` to protect the real OAuth API
   routes — this line prevents that exclusion from also 404ing the consent
   page itself (see the fix in `CHANGELOG.md` 1.0.1).
8. `express.static(publicDir)` then a regex catch-all
   (`/^(?!\/api|\/mcp|\/oauth|\/\.well-known).*/`) that serves `index.html` for
   any other path — this is what makes client-side routing (React Router) work
   for the SPA.

## Stateless MCP design

The `/mcp` endpoint is intentionally **stateless**: `mcp/http.ts` builds a
brand-new `McpServer` (`mcp/server.ts`) and a fresh
`StreamableHTTPServerTransport` (`sessionIdGenerator: undefined`) for **every
single incoming request**, then tears both down when the response closes.

Why: tool availability must always reflect the current state of enabled
connections/tools in the database. A long-lived, cached `McpServer` would
require explicit invalidation logic every time an admin toggles something in
the Web UI; rebuilding it per-request makes that automatic at the cost of some
per-request overhead (a DB read via `loadActiveConnections()` plus tool
registration). See [MCP Protocol](04-MCP-Protocol.md) for the full flow.

## Monorepo layout

```
apps/
  server/       Node + Express backend: /api (management) and /mcp (Streamable HTTP)
    src/
      index.ts          bootstrap Express, mount /mcp, /api, static UI
      api/               REST routes: auth, users, connections, tools, tokens,
                          oauth-clients, logs, playground, dashboard
      auth/              session, password hashing, MCP token gen/hash, PKCE,
                          OAuth token issuance, bootstrap admin seed
      oauth/             OAuth 2.1 authorization server: metadata, DCR,
                          authorize/consent, token endpoint
      mcp/               MCP server construction, bearer-token auth, HTTP router
      connections/       decrypt + assemble active connection configs
      crypto/            AES-256-GCM secret encrypt/decrypt
      logging/           tool-call logging to DB
      env.ts             Zod-validated environment config
    prisma/schema.prisma
  web/          React + Vite admin UI (built into apps/server/public)
    src/
      pages/             one file per UI page (Dashboard, Connections, Tools, ...)
      api/client.ts       fetch wrapper: base URL, CSRF header, error handling
      auth/AuthContext.tsx session state (current user, login/logout/refresh)
packages/
  connectors/   AppConnector abstraction + registry + the Geektastic Realms connector
    src/
      types.ts            AppConnector / ToolDefinition interfaces
      registry.ts          known connectors + aggregateTools()
      geektastic/          index.ts (tool defs + Zod schemas), client.ts (REST client)
  shared/       TypeScript types shared between server and web (packages/shared/src/index.ts)
```

Build order (enforced by `package.json`'s root `build` script and the
Dockerfile): `shared` → `connectors` → `web` → `server`. `web` and `connectors`
both depend on `shared`; `server` depends on `connectors` and serves `web`'s
build output.

## Tech stack

| Layer | Choice |
|---|---|
| Backend runtime | Node 22, TypeScript, ESM (`"type": "module"`) |
| HTTP framework | Express 4 |
| MCP transport | `@modelcontextprotocol/sdk`'s `StreamableHTTPServerTransport` |
| Database | PostgreSQL 16 (official `postgres:16-alpine` image) |
| ORM | Prisma 5 (client generated to `apps/server/generated/prisma`) |
| Validation | Zod 3, everywhere: env vars, API bodies, tool input schemas, connector config |
| Sessions | `express-session` + `connect-pg-simple` (sessions table auto-created in Postgres) |
| Password hashing | bcryptjs, 12 salt rounds |
| Secrets at rest | AES-256-GCM via Node's built-in `crypto` |
| Web UI | React 18, React Router 6, TanStack Query 5, Tailwind CSS, Vite 5 |
| Monorepo | pnpm workspaces (`pnpm-workspace.yaml`), pinned `pnpm@11.10.0` |

See [Development](09-Development.md) for exact dependency versions per
package.
