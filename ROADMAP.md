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
- `gr_list_modules` / `gr_get_module` (lightweight outline — no body text) /
  `gr_create_module` / `gr_update_module`
- `gr_search_sections` / `gr_get_section` (full content: one Act/Chapter/Scene at
  a time, since a module's full text can be hundreds of KB) / `gr_create_section` /
  `gr_update_section`
- `gr_create_handout` / `gr_update_handout`
- `gr_create_encounter` / `gr_update_encounter` — accepts an `adversaries`
  array (`entry_id` + `quantity`) to set which creatures are in the fight
- Roll Tables are exposed on the GR side as of v1.18.0
  (`/api/v1/modules/{moduleId}/roll-tables*`) but not yet as connector tools here —
  tracked in Phase 7 below.

### Geektastic Family Tree tools (backed by `/api/v1/*`, see docs/API.md in the Family Tree repo)
Second connector, implemented in `packages/connectors/src/family-tree/index.ts` and
`client.ts`. Auth is a per-user token (Account menu -> API Tokens) that acts as that
user's own per-tree role (viewer/contributor/editor/admin) — everything is scoped
under `/trees/{treeId}/...`:
- `ft_list_trees` / `ft_get_tree` / `ft_set_home_person`
- `ft_search_people` / `ft_create_person` / `ft_get_person` / `ft_update_person` /
  `ft_delete_person` — plus `ft_add_name` / `ft_update_name` / `ft_delete_name`,
  `ft_get_pedigree`, `ft_get_descendants`
- `ft_list_families` / `ft_create_family` / `ft_get_family` / `ft_update_family` /
  `ft_delete_family` — plus `ft_add_child` / `ft_update_child_relation` / `ft_remove_child`
- `ft_list_events` / `ft_create_event` / `ft_get_event` / `ft_update_event` / `ft_delete_event`
- `ft_list_places` / `ft_create_place` / `ft_get_place` / `ft_update_place` / `ft_delete_place`
- `ft_list_sources` / `ft_create_source` / `ft_get_source` / `ft_update_source` / `ft_delete_source`
- `ft_list_repositories` / `ft_create_repository` / `ft_get_repository` /
  `ft_update_repository` / `ft_delete_repository`
- `ft_list_citations` / `ft_create_citation` / `ft_get_citation` / `ft_update_citation` /
  `ft_delete_citation` / `ft_detach_citation`
- `ft_list_notes` / `ft_create_note` / `ft_get_note` / `ft_update_note` / `ft_delete_note`
- `ft_list_media` / `ft_get_media` / `ft_delete_media` — metadata only; upload/replace is
  multipart/form-data and stays a web-app-only action
- `ft_list_research_tasks` / `ft_create_research_task` / `ft_get_research_task` /
  `ft_update_research_task` / `ft_delete_research_task`
- `ft_list_dna_matches` / `ft_create_dna_match` / `ft_get_dna_match` /
  `ft_update_dna_match` / `ft_delete_dna_match`
- `ft_search` (typeahead), `ft_get_relationship`, `ft_get_gaps_report`,
  `ft_get_duplicates_report`

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

> Status: Phases 1–6 are **built, deployed, and in real use** — v1.2.0 is running as a
> Docker stack, serving Claude Desktop/Claude.ai over OAuth 2.1 and Claude Code over
> Bearer tokens, with 46 Geektastic Realms tools and 69 Geektastic Family Tree tools
> live (see [CHANGELOG.md](CHANGELOG.md)). Phase 7 is also now shipped (see below).
> Remaining Phase 6 items (tracked Prisma migrations, a full security pass, automated
> tests) roll forward into **Phase 9** below. Forward work is planned in
> "Delivery Phases — what's next" following this section.

### Phase 1 — Scaffold & infrastructure
- [x] pnpm monorepo (`apps/server`, `apps/web`, `packages/connectors`, `packages/shared`)
- [x] Dockerfile (multi-stage) + docker-compose (app + Postgres) + `.env.example`
- [x] Prisma schema; startup runs `prisma db push` (no migration history yet — see README)
- [x] `/health` endpoint
- [x] **Verify:** `docker compose up` → health green; Postgres persists on restart

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

## Delivery Phases — what's next

The phases below serve the same DM-first goal as the rest of the Geektastic stack (see
`ROADMAP.md` in the geektastic-realms repo): Claude as a **prep co-DM** that can read
the world, write lore and adventures, and leave everything ready to pull into Foundry
VTT. Tool phases track the GR API — each new GR endpoint family lands here as tools in
the same release window, the pattern already proven by entries → modules → adversaries
in v1.0.1–v1.0.5.

### Phase 7 — GR tool coverage: close the content loop ✅ shipped (v1.2.0)

Tracked GR's "Priority 1" API work so no prep content type is invisible to Claude —
all six items shipped in one pass; total GR tool count 22 → 46. See
[CHANGELOG.md](CHANGELOG.md) and
[Docs/05-GR-Tools-Reference.md](Docs/05-GR-Tools-Reference.md).

- [x] **Roll Tables** — `gr_list_roll_tables` / `gr_get_roll_table` /
      `gr_create_roll_table` / `gr_update_roll_table` (rows included; the single most
      generative-AI-friendly content type — wandering monsters, loot, rumors).
      Lightweight list + full-detail-by-id, same split as sections.
- [x] **Campaign writes** — `gr_create_campaign` / `gr_update_campaign`.
- [x] **Individual reads** — `gr_get_encounter` / `gr_get_handout` — fetch one by id
      without pulling the whole section.
- [x] **Session logs** — `gr_list_sessions` / `gr_get_session` / `gr_create_session` /
      `gr_update_session`: "here are my messy notes, write the recap and next-session
      prep" is a marquee MCP use case, and reads give Claude campaign continuity.
- [x] **World history** — era/event tools so worldbuilding chats can file timeline
      events as they invent them. Gated by GR's `history` resource scope — a
      connection's token needs that scope granted (in addition to
      `entries`/`modules`/`campaigns`/`foundry`) before these tools return anything
      but a 403.
- [x] **Deletes** — `gr_delete_entry` / `gr_delete_section` / `gr_delete_encounter` /
      `gr_delete_handout`. Gated behind the existing per-tool disable so an admin can
      run a no-delete server; all four are irreversible (no undo on the GR side).
      Deletes for campaigns/roll tables/session logs remain unavailable — GR doesn't
      expose those `DELETE` endpoints yet.

### Phase 8 — MCP surface beyond tools

- [ ] **Prompts** — ship reusable MCP prompts encoding real DM workflows:
      *session-prep* (read module outline + session log + in-progress sections, draft
      the prep sheet), *recap-writer*, *statblock-from-description*,
      *populate-encounter* (pick adversaries by CR budget from existing statblocks).
- [ ] **Resources** — expose read-heavy content (module outlines, entry bodies) as MCP
      resources so clients that prefer resource attachment over tool calls can browse.
- [ ] **Response-size discipline** — codify the v1.0.4 lesson (outline vs full-content
      endpoints) as a connector-SDK convention: any list/detail tool must have a
      bounded worst case.

### Phase 9 — Engineering hardening (carried from Phase 6)

- [ ] Tracked Prisma migrations (`prisma migrate dev --name init` → commit
      `migrations/` → Dockerfile back to `migrate deploy`).
- [ ] Automated tests: connector client against a GR fixture server; auth/OAuth flows;
      one end-to-end MCP round-trip in CI.
- [ ] Full security pass on secret handling; dependency audit in CI.

### Phase 10 — Operations & multi-connection polish

- [ ] **Per-token tool/connection scoping** — today a token grants all enabled tools on
      all enabled connections; scope tokens to a connection (and optionally a tool
      subset) so a "worldbuilding-only" token can't touch another world.
- [ ] **Dashboard usage analytics** — calls per tool/day, error rates over time, top
      slow tools (data already in `tool_call_logs`).
- [ ] **Log retention** — configurable pruning of `tool_call_logs` (superadmin
      setting + scheduled job).
- [ ] **Second connector** — when a second app is ready, use it to validate the
      `AppConnector` abstraction for real and document the connector SDK against a
      worked example.

---

## Resolved Items
- ~~Provide the Geektastic Realms OpenAPI spec / endpoint docs + auth scheme~~ — resolved.
  See **Docs/API.md** in the geektastic-realms repo: `/api/v1/*` and the unified `grt_...`
  scoped bearer tokens (originally `grapi_...`), plus the full `gr-statblock-v1` field
  mapping. The connector in `packages/connectors/src/geektastic/` is implemented against it.
