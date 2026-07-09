# API Reference

All routes below are mounted under `/api` (`apps/server/src/api/router.ts`)
unless noted otherwise. All responses are JSON. Request bodies are validated
with Zod; a validation failure returns `400 { error: <zod message> }`.

**Auth conventions:**
- `requireAuth` — any logged-in user (session cookie).
- `requireAdmin` — logged-in **and** `role === "admin"`.
- `requireCsrf` — for any non-`GET/HEAD/OPTIONS` request, the client must send
  header `X-CSRF-Token` matching `req.session.csrfToken` (double-submit
  pattern). See [Security](06-Security.md#csrf).

Unauthenticated requests to a guarded route get `401 { error: "Not authenticated" }`;
authenticated-but-wrong-role requests get `403 { error: "Admin role required" }`.

## Auth — `/api/auth` (`auth.routes.ts`)

| Method & path | Auth | Body | Notes |
|---|---|---|---|
| `GET /api/auth/csrf` | none | — | Returns `{ csrfToken }`, creating one on the session if absent. |
| `POST /api/auth/login` | none (rate-limited: 20/15min per the route) | `{ username, password }` | On success: regenerates the session (`req.session.regenerate`, prevents fixation), sets `userId`/`role`, updates `lastLoginAt`, mints a **fresh** CSRF token (regeneration wipes the old one), and returns `{ user, csrfToken }`. Failure: `401 { error: "Invalid username or password" }` (same message whether the username or password was wrong, and for disabled accounts). |
| `POST /api/auth/logout` | `requireAuth` + `requireCsrf` | — | Destroys the session, clears the `geektastic.sid` cookie, `204`. |
| `GET /api/auth/me` | `requireAuth` | — | Returns `{ user }` for the current session. |
| `POST /api/auth/change-password` | `requireAuth` + `requireCsrf` | `{ currentPassword, newPassword }` | Verifies `currentPassword` against the stored hash first; `newPassword` min 8 chars. Clears `mustChangePassword`. `204` on success. |

## Users — `/api/users` (admin only; `users.routes.ts`)

Every route here has `requireAdmin` applied at the router level.

| Method & path | Body | Notes |
|---|---|---|
| `GET /api/users` | — | `{ users: PublicUser[] }`, ordered by `createdAt` ascending. |
| `POST /api/users` | `{ username, email, password, role }` | `username` 3–64 chars, `password` min 8. `409` if username or email already taken. New user is created with `mustChangePassword: true`. |
| `PATCH /api/users/:id` | `{ role?, status? }` | `400` if you try to set your own `status` to `disabled`. |
| `POST /api/users/:id/reset-password` | `{ newPassword }` | Sets the password and re-flags `mustChangePassword: true`. `204`. |

There is no delete-user endpoint by design — disable via `PATCH status`.

## Connections — `/api/connections` (admin only; `connections.routes.ts`)

| Method & path | Body | Notes |
|---|---|---|
| `GET /api/connections/connectors` | — | `{ connectors: [{ id, displayName }] }` — every registered connector, regardless of whether it has any configured connections. |
| `GET /api/connections` | — | `{ connections: AppConnectionSummary[] }`, each with a live `health` check (`connector.healthCheck()`) run at request time — this endpoint is not cheap; called on a 15s poll by the Web UI. |
| `POST /api/connections` | `{ appType, name, config }` | `config` is validated against that connector's `configSchema`. `config.baseUrl` is stored in plaintext on the row; the rest of `config` is AES-256-GCM encrypted as one blob (`encryptCredentials`). `400` for an unknown `appType` or a `config` that fails the connector's schema. Returns `201 { id }`. |
| `PATCH /api/connections/:id` | `{ name?, enabled?, config? }` | If `config` is present, it's re-validated against the connector's schema and **replaces** the encrypted credentials wholesale (not merged). `404` if the connection doesn't exist. `204`. |
| `DELETE /api/connections/:id` | — | Cascades to `ToolSetting` rows (DB-level cascade); `204`. |
| `POST /api/connections/:id/test` | — | Decrypts credentials and runs `connector.healthCheck()` on demand, returns the raw `{ ok, detail? }` result. |

## Tools — `/api/tools` (admin only; `tools.routes.ts`)

| Method & path | Body | Notes |
|---|---|---|
| `GET /api/tools` | — | `{ tools: ToolSummary[] }` — every tool from every connection (regardless of that connection's own enabled state — this differs from `aggregateTools()`, which only includes enabled connections; the Tools page shows everything so an admin can toggle tools even on a currently-disabled connection). |
| `POST /api/tools/toggle` | `{ connectionId, toolName, enabled }` | Upserts a `ToolSetting` row on `(connectionId, toolName)`. `204`. |

## Tokens — `/api/tokens` (admin only; `tokens.routes.ts`)

| Method & path | Body | Notes |
|---|---|---|
| `GET /api/tokens` | — | `{ tokens: McpTokenSummary[] }` — never includes the raw token or hash. |
| `POST /api/tokens` | `{ name }` (max 100 chars) | Generates a raw token (`gtmcp_<32 random bytes, base64url>`), stores only its SHA-256 hash. Returns `201 { token: McpTokenSummary, rawToken }` — **the only time `rawToken` is ever returned.** |
| `POST /api/tokens/:id/revoke` | — | Sets `revokedAt`; `204`. Irreversible from the API. |

## OAuth Clients — `/api/oauth-clients` (admin only; `oauthClients.routes.ts`)

Distinct from the `/oauth/*` router (below) — this is the admin-facing CRUD
surface; `/oauth/*` is the actual protocol surface OAuth clients talk to.

| Method & path | Body | Notes |
|---|---|---|
| `GET /api/oauth-clients` | — | `{ clients: OAuthClientSummary[] }`. |
| `POST /api/oauth-clients` | `{ clientName, redirectUris }` | `redirectUris` min 1, each must be a valid URL. Always created with `tokenEndpointAuthMethod: "none"` and `registrationSource: "manual"`. |
| `POST /api/oauth-clients/:id/revoke` | — | In one `$transaction`: sets the client's `revokedAt`, and revokes every non-revoked access token, refresh token, and un-consumed authorization code belonging to it. `204`. |

## Logs — `/api/logs` (any authenticated user; `logs.routes.ts`)

| Method & path | Query params | Notes |
|---|---|---|
| `GET /api/logs` | `status?` (`success`\|`error`), `toolName?` (substring, case-insensitive), `connectionId?`, `limit` (1–200, default 50), `cursor?` | Cursor-paginated, `orderBy: createdAt desc`. Returns `{ logs, nextCursor }` — `nextCursor` is the last row's `id`, or `null` if the page wasn't full (i.e. no more results). |

## Playground — `/api/playground` (any authenticated user; `playground.routes.ts`)

Reuses the exact same tool-aggregation and handler-invocation path as `/mcp`
(`loadActiveConnections()` + `aggregateTools()` from `@geektastic/connectors`)
so a result here is guaranteed identical to what an MCP client would get.

| Method & path | Body | Notes |
|---|---|---|
| `GET /api/playground/tools` | — | `{ tools }` — only tools from enabled connections that are themselves enabled. Each tool's `inputSchema` is converted from its Zod schema to JSON Schema (`zod-to-json-schema`) so the Web UI can render a form. |
| `POST /api/playground/invoke` | `{ connectionId, toolName, input }` (CSRF-protected) | `404` if that tool isn't currently enabled/found. On success, calls the real handler against the real connection, logs the call (with `mcpTokenId: null` — playground calls are attributable to a user session, not a token, though the log row itself doesn't currently record *which* user), and returns `{ result }`. On handler exception, still logs the failure, then returns `500 { error }`. |

## Dashboard — `/api/dashboard` (any authenticated user; `dashboard.routes.ts`)

| Method & path | Notes |
|---|---|
| `GET /api/dashboard/summary` | Returns `{ connections, activeTokenCount, recentErrorRate, recentLogs }`. `connections` is per-connection health (skips the check entirely and reports `{ ok: false, detail: "disabled" }` for disabled connections, to avoid an unnecessary network call). `activeTokenCount` counts non-revoked `McpToken` rows (OAuth tokens aren't included in this count). `recentErrorRate` is the error fraction of the last 10 `ToolCallLog` rows server-wide (`0` if there are none). `recentLogs` is those same last 10, trimmed to display fields. |

## OAuth protocol endpoints (not under `/api`)

These are consumed by OAuth *clients* (Claude Desktop, Claude.ai), not the Web
UI's `fetch` client — see [OAuth 2.1](05-OAuth2.md) for the full flow and
request/response shapes:

| Method & path | Purpose |
|---|---|
| `GET /.well-known/oauth-authorization-server` | RFC 8414 metadata |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 metadata |
| `POST /oauth/register` | RFC 7591 Dynamic Client Registration |
| `GET /oauth/authorize` | Authorization request (browser-navigated) |
| `POST /oauth/authorize/decision` | Consent approve/deny (called by the React consent page) |
| `POST /oauth/token` | Token exchange (`authorization_code` and `refresh_token` grants) |

## MCP endpoint (not under `/api`)

See [MCP Protocol](04-MCP-Protocol.md).

| Method & path | Purpose |
|---|---|
| `POST /mcp` | The actual MCP Streamable HTTP endpoint. Bearer-token authenticated. |
| `GET /mcp`, `DELETE /mcp` | Both return `405` — this server runs the transport in **stateless** mode (`sessionIdGenerator: undefined`), which doesn't support the GET (server-initiated stream) or DELETE (session termination) verbs of the Streamable HTTP spec. |

## Misc

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /health` | none | Liveness probe: `{ ok: true }`. No DB check — it will report healthy even if Postgres is unreachable. |
