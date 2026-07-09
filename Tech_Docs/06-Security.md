# Security

## Two independent auth systems

| | Web UI (`/api/*`, browser) | MCP endpoint (`/mcp`) |
|---|---|---|
| Credential | Session cookie (`geektastic.sid`) | `Authorization: Bearer <token>` |
| Identity source | `express-session`, backed by Postgres (`connect-pg-simple`) | `McpToken` (static) or `OAuthAccessToken` (OAuth) row, looked up by hash |
| Established by | `POST /api/auth/login` (username + bcrypt password) | `POST /api/tokens` (admin-issued) or the OAuth 2.1 flow ([OAuth 2.1](05-OAuth2.md)) |
| CSRF protection | Yes (double-submit token) | N/A — not cookie-based, so CSRF doesn't apply |

These are deliberately kept separate: a stolen session cookie doesn't grant
`/mcp` access, and a leaked MCP token doesn't grant Web UI access.

## Passwords

`auth/password.ts`: bcryptjs, **12 salt rounds**. Never logged, never
returned in any API response. Minimum length is enforced at the Zod layer (8
characters) on creation, reset, and change-password — there is no additional
complexity requirement (uppercase/digit/symbol) enforced server-side.

## Sessions (`auth/session.ts`)

- `express-session` + `connect-pg-simple`, storing sessions in a `session`
  table in the same Postgres database (auto-created on first run).
- Cookie name `geektastic.sid`; `httpOnly: true`; `sameSite: "lax"`; `maxAge`
  7 days.
- `secure` is tied to **`TRUST_PROXY`**, not `NODE_ENV`. This is a deliberate
  fix (see `CHANGELOG.md` 1.0.0's "Fixed" section) for a real incident: the
  deployed stack runs `NODE_ENV=production` but is often exposed over plain
  HTTP with no TLS-terminating reverse proxy in front, and browsers silently
  drop `Secure` cookies sent over an insecure connection — which made every
  post-login request look unauthenticated. Operators must set
  `TRUST_PROXY=true` **only once** a real TLS-terminating reverse proxy is
  actually in front of the server; setting it without one would mean cookies
  never get set at all (not a fail-open — see
  [Deployment](08-Deployment.md#trust_proxy)).
- `req.session.regenerate()` is called on login specifically to prevent
  **session fixation** — it also wipes whatever was previously on the
  session, including a client's cached CSRF token, which is why `/login`
  hands back a freshly generated `csrfToken` in its response body rather than
  requiring a follow-up `GET /api/auth/csrf` call (see `CHANGELOG.md` 1.0.2).

## CSRF

`auth/middleware.ts`'s `requireCsrf`: double-submit cookie pattern. Any
request with a method outside `{ GET, HEAD, OPTIONS }` must include header
`X-CSRF-Token` matching `req.session.csrfToken` exactly, or it's rejected with
`403`. The token itself is 24 random bytes (`ensureCsrfToken()` in
`session.ts`), generated lazily and stored on the session — it's not a
per-request nonce, it's stable for the session's lifetime (until the session
is destroyed/regenerated).

## Rate limiting

Three independently configured `express-rate-limit` instances:

| Limiter | Scope | Limit | Keyed by |
|---|---|---|---|
| Login | `POST /api/auth/login` | 20 / 15 min | default (IP) |
| OAuth registration | `POST /oauth/register` | 20 / min | default (IP) |
| MCP | all of `/mcp` | 120 / min | `Authorization` header, falling back to IP |

The MCP limiter being keyed by token (not IP) means one misbehaving/abusive
client can't exhaust the shared budget for every other client — each token
gets its own window.

## Secrets at rest (`crypto/secrets.ts`)

`AES-256-GCM` via Node's built-in `crypto`, keyed by `APP_ENCRYPTION_KEY`
(64-char hex = 32 bytes, validated by `env.ts`'s Zod schema at startup — the
process refuses to boot with a malformed key).

`encryptSecret(value)`: JSON-serializes `value`, generates a random 12-byte
IV, encrypts, and concatenates `iv || authTag || ciphertext` into one
base64 string. `decryptSecret<T>(payload)` reverses this and JSON-parses the
plaintext. GCM's auth tag means tampering with the stored ciphertext (e.g. a
compromised DB row edited directly) causes decryption to throw rather than
silently return corrupted data.

**What's encrypted:** only the non-`baseUrl` fields of a connection's config
(i.e. `apiKey` for the Geektastic Realms connector) — see
`connections/service.ts`'s `encryptCredentials()`. `baseUrl` itself is stored
in plaintext since it isn't a secret.

**What's never encrypted, only hashed:** passwords (bcrypt), MCP tokens, OAuth
codes/access/refresh tokens (all SHA-256 via `hashMcpToken()` in
`auth/tokens.ts`, reused across the OAuth code paths too). The raw value is
returned to the caller **exactly once**, at creation/issuance time, and is
never recoverable from the database afterward — losing it means revoking and
re-issuing.

**Key rotation:** not implemented. Changing `APP_ENCRYPTION_KEY` would make
every existing `encryptedCredentials` value undecryptable; there's no
migration tooling for this today. Treat `APP_ENCRYPTION_KEY` as effectively
permanent for a given database once connections exist.

## Roles and authorization

Two roles only: `admin`, `member` (see [Data Model](02-Data-Model.md#users-user)).
Enforced server-side by `requireAuth`/`requireAdmin` middleware on every
`/api` route that needs it (never just hidden in the UI — see
`auth/middleware.ts`) — a member hitting an admin-only endpoint directly gets
a real `403`, not just a UI that doesn't show the button.

Self-protection guards, enforced in the route handlers rather than
middleware: a user can't set their own account's `status` to `disabled`
(`users.routes.ts`), and the Web UI additionally disables the role-change
control on your own row (client-side convenience only — the server doesn't
separately block self role changes).

## Logging hygiene

`logToolCall()` (`logging/toolCallLog.ts`) truncates `errorSummary` to 1000
characters and never receives or stores raw request/response payloads or
credential values — only the tool name, status, duration, and an error
message if one occurred. Tool call arguments themselves are **not** persisted
to the log table at all (neither on success nor failure).

## Transport security (TLS)

This server speaks plain HTTP internally and has no built-in TLS termination
— that's expected to be handled by an external reverse proxy (see
[Deployment](08-Deployment.md)). `TRUST_PROXY` is the flag that tells the app
"a proxy is terminating TLS and forwarding `X-Forwarded-*` headers," which
both enables secure cookies (above) and sets Express's `trust proxy` setting.

## Known gaps / things not yet done

Per `ROADMAP.md`'s Phase 6 status: **a full security review of secret
handling has not been completed**, and **no automated tests exist** (auth
flows, CSRF, rate limits, and the OAuth flow are all currently unverified by
CI — only by the manual walkthroughs in `ROADMAP.md`'s "Verification"
section and `scripts/verify-oauth.sh`). Treat this document as a description
of the implemented design, not a completed audit.
