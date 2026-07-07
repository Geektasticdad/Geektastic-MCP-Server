# Geektastic MCP Server — Roadmap

A self-hosted **MCP (Model Context Protocol) server** that exposes the **Geektastic
Realms** application to MCP clients (Claude Desktop/Code and others), with a **Web UI**
for configuration, secrets, tool management, monitoring, and multi-user access. Deploys
as a Docker stack managed through **Portainer**, and is architected so additional
applications can be plugged in over time.

---

## Locked-in Decisions

| Area              | Decision                                                                 |
|-------------------|--------------------------------------------------------------------------|
| GR integration    | REST/HTTP API — `/api/v1/*`, documented in Docs/API.md (geektastic-realms repo) |
| Tech stack        | TypeScript full-stack (Node backend + React UI)                           |
| MCP transport     | Streamable HTTP (remote clients over the network)                         |
| Storage           | PostgreSQL (official container)                                           |
| Web auth          | Multi-user login with **roles (admin + member)**, admin-managed accounts  |
| MCP auth          | Bearer/API tokens (hashed at rest)                                        |
| Web UI features   | Connections & secrets, per-tool enable/disable, logs & monitoring, tool testing playground, user management |
| Base images       | `node:22-alpine` (multi-stage), `postgres:16-alpine`                       |

---

## Goals & Non-Goals

**Goals**
- One deployable stack (server container + Postgres) manageable from Portainer.
- A pluggable **connector** abstraction: Geektastic Realms is the first connector; adding
  a new app = adding a new connector module.
- Secure by default: encrypted secrets at rest, role-based login, hashed MCP tokens.
- Manage everything from the Web UI without editing files.

**Non-Goals (v1)**
- Multi-tenant org isolation / SSO / external identity providers.
- Building the Geektastic Realms API itself (it already exists).
- Theming/whitelabel systems — a clean admin dashboard is enough.

---

## Architecture

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

The **server container serves everything on one port**: the React UI, the `/api`
management endpoints, and the `/mcp` Streamable HTTP endpoint. The Portainer deployment
is two containers (app + Postgres).

### Tech stack detail
- **Backend:** Node 22 + TypeScript, Express, `@modelcontextprotocol/sdk`
  (`StreamableHTTPServerTransport`).
- **DB/ORM:** PostgreSQL + Prisma (migrations).
- **Validation:** Zod (tool input schemas + connector config schemas).
- **Web UI:** React + Vite + TypeScript, Tailwind CSS + shadcn/ui, TanStack Query.
- **Auth:** session cookie (httpOnly, secure) + bcrypt; MCP tokens hashed (sha256).
- **Secrets at rest:** AES-256-GCM (Node `crypto`), key from env.
- **Monorepo:** pnpm workspaces.

### Repository layout (target)
```
Geektastic-MCP-Server/
├─ apps/
│  ├─ server/                 # MCP endpoint + /api + serves UI
│  │  ├─ src/
│  │  │  ├─ index.ts          # bootstrap Express, mount /mcp, /api, static UI
│  │  │  ├─ mcp/              # MCP server setup, transport, token auth middleware
│  │  │  ├─ api/              # routes: auth, users, connections, tokens, logs, tools
│  │  │  ├─ auth/             # session, password, roles, MCP token verification
│  │  │  ├─ crypto/           # AES-256-GCM encrypt/decrypt helpers
│  │  │  └─ logging/          # tool-call + request logging to DB
│  │  └─ prisma/schema.prisma
│  └─ web/                    # React + Vite admin UI (built into apps/server/public)
├─ packages/
│  ├─ connectors/            # AppConnector interface + GR connector + registry
│  │  ├─ src/types.ts
│  │  ├─ src/registry.ts
│  │  └─ src/geektastic/
│  └─ shared/                # shared TS types between server & web
├─ Dockerfile                 # multi-stage build (node:22-alpine)
├─ docker-compose.yml         # app + postgres — the Portainer stack
├─ .env.example
└─ README.md
```

---

## Connector Abstraction (room to grow)

Every application implements one interface. The registry aggregates tools only from
**enabled** connectors and **enabled** tools.

```ts
export interface AppConnector {
  id: string;                 // e.g. "geektastic-realms"
  displayName: string;
  configSchema: ZodSchema;     // fields rendered in the UI connection form
  healthCheck(cfg: ConnectorConfig): Promise<{ ok: boolean; detail?: string }>;
  getTools(cfg: ConnectorConfig): ToolDefinition[];
}

export interface ToolDefinition {
  name: string;                // namespaced, e.g. "gr_search_statblocks"
  description: string;
  inputSchema: ZodSchema;
  handler(input: unknown, cfg: ConnectorConfig): Promise<ToolResult>;
}
```

Adding a new app later = a new folder under `packages/connectors/src/<app>/` implementing
`AppConnector`, then registering it. UI, tokens, logging, and enable/disable all work
automatically.

### Geektastic Realms tools (backed by `/api/v1/*`, see Docs/API.md in the GR repo)
Concrete tools, implemented in `packages/connectors/src/geektastic/index.ts` and
`client.ts` against the real `gr-statblock-v1`/`gr-entry-v1`/`gr-module-v1` formats:
- `gr_search_statblocks` / `gr_get_statblock` / `gr_create_statblock` / `gr_update_statblock`
- `gr_list_campaigns` / `gr_get_campaign`
- `gr_search_entries` / `gr_get_entry` / `gr_create_entry` / `gr_update_entry` — any
  category's lore entries, with a category-specific `custom_fields` bag
- `gr_list_modules` / `gr_get_module` / `gr_create_module` / `gr_update_module`
- `gr_create_section` / `gr_update_section` — Acts/Chapters/Scenes/Appendices
- `gr_create_handout` / `gr_update_handout`
- `gr_create_encounter` / `gr_update_encounter`
- Extend further as GR's API grows (Roll Tables not yet exposed).

---

## Data Model (Postgres via Prisma)

- **users** — `id, username, email, passwordHash, role (admin|member), status (active|disabled), mustChangePassword, createdAt, lastLoginAt`.
- **app_connections** — `id, appType, name, baseUrl, encryptedCredentials, enabled, createdAt`.
- **tool_settings** — `id, connectionId, toolName, enabled`.
- **mcp_tokens** — `id, name, tokenHash, scopes, createdAt, lastUsedAt, revokedAt`.
- **tool_call_logs** — `id, tokenId, connectionId, toolName, status, durationMs, errorSummary, createdAt` (no secret values; truncated payloads).
- **settings** — key/value for global server config.

Secrets (`encryptedCredentials`) are AES-256-GCM encrypted with `APP_ENCRYPTION_KEY`
(env). MCP tokens are stored hashed; the raw token is shown once at creation.

---

## Authentication, Roles & Security

- **Multi-user login:** username + bcrypt password; httpOnly + secure session cookie; CSRF
  protection on state-changing `/api` routes. Initial **admin** seeded from env
  (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) on first run. Thereafter **admins create accounts**
  (no open sign-up), set an initial password, and flag `mustChangePassword`.
- **Roles:**
  - `admin` — full access: users, connections, secrets, tokens, tool toggles, settings, logs.
  - `member` — restricted: view dashboard/logs, use the testing playground for enabled tools;
    **cannot** view/edit secrets, manage users/tokens, or toggle tools.
  - Enforced by `requireAuth` / `requireAdmin` middleware on `/api`, and by hiding admin-only
    pages/controls in the UI. Sensitive actions record the acting user.
- **MCP endpoint (`/mcp`):** requires `Authorization: Bearer <token>`, verified against hashed
  `mcp_tokens`; updates `lastUsedAt`; rejects revoked tokens; rate-limited.
- **Secrets at rest:** AES-256-GCM; encryption key from env / Portainer secret, never in the DB.
- **Logging:** excludes secret values; truncates large payloads.
- **TLS:** terminate at your existing reverse proxy; the container speaks HTTP internally.

---

## Web UI Pages

1. **Dashboard** — server + per-connection health, recent tool calls, error rate, active tokens.
2. **Connections** — CRUD for app connections; GR connection form; "Test connection" button. *(admin)*
3. **Tools** — tools grouped by connection with enable/disable toggles. *(admin)*
4. **Tokens** — create/revoke MCP tokens; show raw token once; show `lastUsedAt`. *(admin)*
5. **Testing Playground** — pick an enabled tool, render a form from its Zod schema, invoke via an
   internal endpoint that reuses the **same handler path** as `/mcp`, and show the JSON result.
6. **Logs** — searchable/filterable tool-call log with status, duration, error detail.
7. **Users** — list/create/disable users, set roles, reset passwords. *(admin only)*
8. **Settings / Profile** — every user changes their own password; admins get global config.

---

## Docker / Portainer Deployment

**Dockerfile (multi-stage)**
1. Build stage `FROM node:22-alpine`: pnpm install, build `apps/web` → static assets, build `apps/server`.
2. Runtime stage `FROM node:22-alpine`: copy server dist + UI assets, run `prisma migrate deploy`
   on startup, then `node dist/index.js`.

**docker-compose.yml (the Portainer stack)**
```yaml
services:
  mcp-server:
    image: geektastic-mcp-server:latest   # or build: .
    ports: ["8080:8080"]
    environment:
      DATABASE_URL: postgres://mcp:${DB_PASSWORD}@postgres:5432/mcp
      APP_ENCRYPTION_KEY: ${APP_ENCRYPTION_KEY}
      SESSION_SECRET: ${SESSION_SECRET}
      ADMIN_USERNAME: ${ADMIN_USERNAME}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    depends_on: [postgres]
    restart: unless-stopped
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: mcp
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: mcp
    volumes: ["pgdata:/var/lib/postgresql/data"]
    restart: unless-stopped
volumes:
  pgdata:
```

- Deploy in Portainer as a **Stack**; set env vars (`DB_PASSWORD`, `APP_ENCRYPTION_KEY`,
  `SESSION_SECRET`, admin creds) in the stack environment.
- Volume `pgdata` persists config/secrets/logs/users across updates.
- Publish port `8080` (or route through your reverse proxy for TLS + hostname).

---

## Delivery Phases

> Status: Phases 1–5 are scaffolded in code (not yet installed, type-checked, or run — see
> "Known gaps" in [README.md](README.md)). Phase 6 is partially done (rate limiting + CSRF
> are in; a full security pass and finalized docs are still open).

### Phase 1 — Scaffold & infrastructure
- [x] pnpm monorepo (`apps/server`, `apps/web`, `packages/connectors`, `packages/shared`)
- [x] Dockerfile (multi-stage) + docker-compose (app + Postgres) + `.env.example`
- [x] Prisma schema; startup runs `prisma db push` (no migration history yet — see README)
- [x] `/health` endpoint
- [ ] **Verify:** `docker compose up` → health green; Postgres persists on restart

### Phase 2 — Auth, users & connections
- [x] Session login, bcrypt passwords, CSRF; bootstrap admin from env
- [x] Roles (admin/member) + `requireAuth` / `requireAdmin` middleware
- [x] User management (admin creates accounts, roles, disable/enable, reset password, `mustChangePassword`)
- [x] Connections CRUD + AES-256-GCM secret encryption + GR "test connection"

### Phase 3 — Connector layer
- [x] `AppConnector` / `ToolDefinition` interfaces + registry
- [x] Geektastic Realms connector implemented against the real `/api/v1/*` endpoints
      and `gr-statblock-v1` schema (see `packages/connectors/src/geektastic/client.ts`
      and Docs/API.md in the geektastic-realms repo)
- [x] `healthCheck` for dashboard status

### Phase 4 — MCP endpoint
- [x] Streamable HTTP `/mcp` via MCP SDK
- [x] Bearer-token auth middleware (hashed tokens, `lastUsedAt`, revoke, rate limit)
- [x] Tool aggregation from enabled connectors + per-tool enable/disable
- [x] Tool-call logging to DB

### Phase 5 — Web UI
- [x] Dashboard, Connections, Tools toggles, Tokens
- [x] Testing Playground (reuses real handlers)
- [x] Logs
- [x] Users (admin) + Profile/password; role-based hiding of admin controls

### Phase 6 — Harden & document
- [x] Rate limiting (login + `/mcp`), CSRF (double-submit token)
- [ ] Full security review of secret handling; adopt tracked Prisma migrations
- [x] README: Portainer deploy steps + `claude mcp add` client setup
- [x] `.env.example` finalized

---

## Verification (end-to-end)

1. **Stack up:** `docker compose up -d`; UI loads, `/health` green, Postgres persists after restart.
2. **Users & roles:** log in as bootstrap admin; create a second admin and a member; confirm the
   member is forced to change password on first login, cannot see Users/Tokens/secret fields/tool
   toggles, and gets 403 hitting an admin `/api` route directly; disable a user and confirm they
   can no longer log in.
3. **Connection:** as admin, add the GR connection with real API creds; "Test connection" succeeds;
   dashboard health OK.
4. **Token + client:** create an MCP token; connect a client, e.g.
   `claude mcp add --transport http geektastic https://<host>/mcp --header "Authorization: Bearer <token>"`;
   list tools and confirm GR tools appear.
5. **Tool call:** invoke a GR tool (e.g. `gr_search_statblocks`); verify the result and a matching
   entry in the **Logs** page.
6. **Toggle:** disable a tool in the UI; confirm it disappears from the client's tool list.
7. **Playground:** run the same tool from the Testing Playground; verify identical result + new log entry.
8. **Portainer:** import `docker-compose.yml` as a Stack, set env vars, deploy, and repeat steps 1–4
   on the deployed instance.

---

## Open Item
- ~~Provide the Geektastic Realms OpenAPI spec / endpoint docs + auth scheme~~ — resolved.
  See **Docs/API.md** in the geektastic-realms repo: `/api/v1/*`, `grapi_...` bearer
  tokens (generated from a world's General API Access panel), and the full
  `gr-statblock-v1` field mapping. The connector in `packages/connectors/src/geektastic/`
  is implemented against it.
