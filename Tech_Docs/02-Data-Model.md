# Data Model

Source of truth: `apps/server/prisma/schema.prisma`. Provider: PostgreSQL.
Prisma client output: `apps/server/generated/prisma` (not the default
`node_modules/.prisma` location).

## Core tables

### `users` (`User`)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `username` | string, unique | |
| `email` | string, unique | |
| `passwordHash` | string | bcrypt, 12 rounds |
| `role` | enum `admin` \| `member` | default `member` |
| `status` | enum `active` \| `disabled` | default `active` |
| `mustChangePassword` | boolean | default `false`; set on creation and on admin-triggered password reset |
| `createdAt` | datetime | |
| `lastLoginAt` | datetime, nullable | updated on successful login |

Relations (all `SetNull` on delete — no cascading account deletion path
exists in the API, only disable): connections created, tokens created, OAuth
clients created, and as the subject of OAuth authorization codes/access
tokens/refresh tokens.

### `app_connections` (`AppConnection`)

One configured link to an application (currently only
`appType = "geektastic-realms"`).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `appType` | string | connector id, e.g. `"geektastic-realms"` |
| `name` | string | admin-chosen label |
| `baseUrl` | string | stored in plaintext (not a secret) |
| `encryptedCredentials` | string | AES-256-GCM ciphertext (base64) of the non-`baseUrl` config fields — see [Security](06-Security.md) |
| `enabled` | boolean | default `true`; disabling hides all its tools from `/mcp` and the playground without deleting config |
| `createdAt` | datetime | |
| `createdById` | uuid, nullable, `SetNull` | |

Cascades: deleting a connection cascades to its `ToolSetting` rows and sets
`connectionId` to null on its `ToolCallLog` rows.

### `tool_settings` (`ToolSetting`)

Per-connection, per-tool enable/disable override.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `connectionId` | uuid, FK → `AppConnection`, `Cascade` | |
| `toolName` | string | e.g. `"gr_search_statblocks"` |
| `enabled` | boolean | default `true` |

Unique on `(connectionId, toolName)`. **Absence of a row means enabled** — a
connector's tool list is computed dynamically (`connector.getTools(cfg)`), and
only tools explicitly recorded as `enabled: false` are filtered out
(`loadActiveConnections()` in `apps/server/src/connections/service.ts`
inverts this: it collects the *disabled* set, then subtracts it from all known
tool names).

### `prompt_settings` (`PromptSetting`)

Per-connection, per-prompt enable/disable override — a verbatim structural
mirror of `ToolSetting` (added in Phase 8 for MCP Prompts support), including
the same "absence means enabled" semantics.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `connectionId` | uuid, FK → `AppConnection`, `Cascade` | |
| `promptName` | string | e.g. `"gr_session_prep"` |
| `enabled` | boolean | default `true` |

Unique on `(connectionId, promptName)`.

### `mcp_tokens` (`McpToken`)

Static bearer tokens for non-OAuth MCP clients (e.g. Claude Code CLI).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `name` | string | admin-chosen label |
| `tokenHash` | string, unique | SHA-256 hex of the raw token; raw value is never stored |
| `scopes` | string[] | default `[]` — present in the schema but not currently enforced/used by any code path |
| `createdAt` | datetime | |
| `lastUsedAt` | datetime, nullable | updated on every successful `/mcp` auth |
| `revokedAt` | datetime, nullable | set (not deleted) on revoke |
| `createdById` | uuid, nullable, `SetNull` | |

### `tool_call_logs` (`ToolCallLog`)

One row per tool invocation, from either `/mcp` or the Testing Playground.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `tokenId` | uuid, nullable, FK → `McpToken`, `SetNull` | set when the call came in via a static token |
| `oauthAccessTokenId` | uuid, nullable, FK → `OAuthAccessToken`, `SetNull` | set when the call came in via OAuth |
| `connectionId` | uuid, nullable, FK → `AppConnection`, `SetNull` | |
| `toolName` | string | |
| `status` | enum `success` \| `error` | |
| `durationMs` | int | |
| `errorSummary` | string, nullable | truncated to 1000 chars in `logToolCall()`; never includes secret values |
| `createdAt` | datetime | indexed |

Both `tokenId` and `oauthAccessTokenId` exist as separate nullable columns
specifically because `McpToken` and `OAuthAccessToken` are different models —
a single `tokenId` FK can't point at either. Playground-originated calls have
both null (see `playground.routes.ts`, which passes `mcpTokenId: null` and
omits `oauthAccessTokenId`).

### `prompt_call_logs` (`PromptCallLog`)

One row per prompt invocation (`prompts/get` via `/mcp`, or the Testing
Playground's prompt tab) — a structural mirror of `ToolCallLog`, kept as a
**separate** table rather than folding prompts into `ToolCallLog` with a
discriminator column. Every prior "second concept" addition in this codebase
(Tools → Playground → Tokens → OAuth Clients) has been purely additive, never
a rename/merge, so mirroring the existing model exactly is lower-risk (zero
touch to the tool-call path) and consistent with house style — the Logs page
gained a Tool/Prompt tab instead.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `tokenId` | uuid, nullable, FK → `McpToken`, `SetNull` | |
| `oauthAccessTokenId` | uuid, nullable, FK → `OAuthAccessToken`, `SetNull` | |
| `connectionId` | uuid, nullable, FK → `AppConnection`, `SetNull` | |
| `promptName` | string | |
| `status` | enum `success` \| `error` (reuses `ToolCallStatus`) | |
| `durationMs` | int | |
| `errorSummary` | string, nullable | truncated to 1000 chars in `logPromptCall()`, same as tool logging |
| `createdAt` | datetime | indexed |

### `settings` (`Setting`)

Generic key/value store for global server config. `key` is the primary key,
`value` is a plain string. **Not currently written or read by any route** —
present for future use (per `ROADMAP.md`'s "Settings / Profile" page, of which
only Profile is implemented).

## OAuth 2.1 tables

See [OAuth 2.1](05-OAuth2.md) for the full flow these support.

### `oauth_clients` (`OAuthClient`)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | this **is** the OAuth `client_id` |
| `clientName` | string | |
| `redirectUris` | string[] | exact-match allowlist, checked on every authorize/token request |
| `tokenEndpointAuthMethod` | enum, only value `none` | public clients only — no client secret is ever stored (v1 design decision) |
| `grantTypes` | string[] | default `["authorization_code", "refresh_token"]` |
| `registrationSource` | string | `"dcr"` (self-registered via RFC 7591) or `"manual"` (admin-created in the UI) |
| `createdAt` | datetime | |
| `revokedAt` | datetime, nullable | revoking cascades (application-level, via `$transaction`, not a DB cascade) to all its outstanding codes/tokens — see `oauthClients.routes.ts` |
| `createdById` | uuid, nullable, `SetNull` | null for DCR-registered clients (no authenticated user involved in self-registration) |

### `oauth_authorization_codes` (`OAuthAuthorizationCode`)

Short-lived (60 seconds — `AUTH_CODE_TTL_MS` in `authorize.routes.ts`), single-use codes from the `/oauth/authorize` → `/oauth/authorize/decision` step.

| Column | Type | Notes |
|---|---|---|
| `codeHash` | string, unique | SHA-256 of the raw code |
| `clientId` | FK → `OAuthClient`, `Cascade` | |
| `userId` | FK → `User`, `Cascade` | the user who approved the consent screen |
| `redirectUri` | string | must match exactly at token-exchange time |
| `codeChallenge` / `codeChallengeMethod` | string | PKCE (S256 only) |
| `resource` | string, nullable | RFC 8707 resource indicator, passed through if given |
| `scopes` | string[] | default `["mcp:tools"]` |
| `expiresAt` | datetime | |
| `consumedAt` | datetime, nullable | set on redemption; a code with this set can't be redeemed again |

### `oauth_access_tokens` / `oauth_refresh_tokens`

Structurally identical: `tokenHash` (unique, SHA-256), `clientId` (FK,
`Cascade`), `userId` (FK, `Cascade`), `scopes`, `expiresAt`, `revokedAt`,
`createdAt`. Access tokens additionally track `lastUsedAt` (updated by
`mcp/auth.ts` on every use, same as `McpToken`). Lifetimes: access tokens 1
hour, refresh tokens 90 days (`token.routes.ts`).

## Sessions

Not a Prisma model — `connect-pg-simple` manages its own `session` table
directly (auto-created via `createTableIfMissing: true` in
`apps/server/src/auth/session.ts`), storing serialized session data
(`userId`, `role`, `csrfToken`) keyed by session ID, backed by the same
`DATABASE_URL` Postgres instance.

## Migrations

**No tracked Prisma migration history exists yet.** The container runs
`prisma db push --skip-generate --accept-data-loss` on startup (see the
`Dockerfile` CMD) instead of `prisma migrate deploy`. This is a known,
explicitly-flagged gap — see [Development](09-Development.md#known-gaps) for
what adopting real migrations would involve.
