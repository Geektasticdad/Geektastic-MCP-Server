# OAuth 2.1

This server acts as a combined **OAuth 2.1 authorization server + resource
server** (both roles in the same app — explicitly permitted by the [MCP
Authorization
spec](https://modelcontextprotocol.io/specification/draft/basic/authorization)).
It exists to let OAuth-only MCP clients — Claude Desktop and Claude.ai's
Custom Connector — connect, since they don't support a manually-configured
static bearer header the way Claude Code CLI does.

Design constraints baked into the implementation:
- **Public clients only.** `tokenEndpointAuthMethod` is a single-value enum
  (`none`) — no client secret is ever generated or stored. This matches how
  Claude's Dynamic Client Registration / CIMD clients authenticate.
- **PKCE (S256) is mandatory** on every authorization request — there is no
  code path that accepts `plain` or omits it.
- All discovery/issuer URLs are derived from `PUBLIC_BASE_URL` (must be an
  absolute, externally-reachable origin — see [Deployment](08-Deployment.md)).

## Endpoints

| Endpoint | File | Spec |
|---|---|---|
| `GET /.well-known/oauth-authorization-server` | `oauth/wellKnown.routes.ts` → `oauth/metadata.ts` | RFC 8414 |
| `GET /.well-known/oauth-protected-resource` | same | RFC 9728 |
| `POST /oauth/register` | `oauth/register.routes.ts` | RFC 7591 (DCR) |
| `GET /oauth/authorize` | `oauth/authorize.routes.ts` | RFC 6749 §4.1.1 + PKCE |
| `POST /oauth/authorize/decision` | same | consent decision (not part of RFC 6749 itself — internal, called by the React consent page) |
| `POST /oauth/token` | `oauth/token.routes.ts` | RFC 6749 §4.1.3 (`authorization_code`), §6 (`refresh_token`) |

`buildAuthorizationServerMetadata()` advertises: `scopes_supported:
["mcp:tools"]`, `response_types_supported: ["code"]`, `grant_types_supported:
["authorization_code", "refresh_token"]`,
`token_endpoint_auth_methods_supported: ["none"]`,
`code_challenge_methods_supported: ["S256"]`,
`authorization_response_iss_parameter_supported: true`.

## Full flow

```
1. Client discovers metadata          GET /.well-known/oauth-authorization-server
                                       GET /.well-known/oauth-protected-resource
2. Client self-registers (usually)    POST /oauth/register  → { client_id, ... }
3. Client opens browser to            GET /oauth/authorize?response_type=code&
                                         client_id=...&redirect_uri=...&
                                         code_challenge=...&code_challenge_method=S256&
                                         state=...&resource=...&scope=...
4. Not logged in? → redirect to       GET /login?returnTo=/oauth/consent?...
5. Logged in → redirect to            GET /oauth/consent?client_id=...&clientName=...&
                                         redirect_uri=...&code_challenge=...&state=...
                                       (React page: apps/web/src/pages/OAuthConsent.tsx)
6. User clicks Approve/Deny →         POST /oauth/authorize/decision
                                       (session cookie + CSRF token; re-validates
                                        client_id/redirect_uri server-side)
   → { redirectTo: "<redirect_uri>?code=...&state=...&iss=..." }
   (Deny → { redirectTo: "<redirect_uri>?error=access_denied&state=..." })
7. Browser navigates to redirectTo, handing the code back to the client
8. Client exchanges the code          POST /oauth/token
                                         grant_type=authorization_code&code=...&
                                         redirect_uri=...&client_id=...&code_verifier=...
   → { access_token, token_type: "Bearer", expires_in: 3600,
       refresh_token, scope }
9. Client calls MCP                   POST /mcp
                                         Authorization: Bearer gtoat_<access_token>
10. Access token expires (1h) →       POST /oauth/token
    client refreshes                    grant_type=refresh_token&refresh_token=...
    → new { access_token, refresh_token, ... } (old refresh token revoked — rotation)
```

## Step-by-step notes

### 1–2. Discovery + registration

`POST /oauth/register` is intentionally **unauthenticated** (rate-limited to
20/min instead) — per RFC 7591 and MCP's expectations, a client must be able
to register itself with no human present. It accepts `client_name` and
`redirect_uris` (both required), creates an `OAuthClient` row with
`registrationSource: "dcr"`, and returns the new `client_id` plus echoed
metadata. There is no `client_secret` in the response (public client).

An admin can also pre-register a client manually via **`POST
/api/oauth-clients`** in the Web UI (`registrationSource: "manual"`) — for
connectors whose setup screen doesn't attempt DCR and instead asks for a
Client ID up front.

### 3–4. Authorization request

`GET /oauth/authorize` validates `client_id` + `redirect_uri` **first and
strictly**, against the client's registered `redirectUris` — exact string
match, not prefix/pattern. This check happens before anything else in the
handler specifically because until both are confirmed valid, there is no safe
place to redirect an error to (an unvalidated `redirect_uri` is an
open-redirect vector). Only after that check passes does the handler validate
`response_type === "code"` and the presence of `code_challenge` +
`code_challenge_method === "S256"`, redirecting error responses back to the
(now-validated) `redirect_uri` per RFC 6749 §4.1.2.1.

If the browser has no session, it's bounced to `/login?returnTo=<consent
url>`; the Login page's `returnTo` handling only accepts same-origin relative
paths (`safeReturnTo()` in `apps/web/src/pages/Login.tsx` rejects anything not
starting with `/` or starting with `//`) — another open-redirect guard, this
time on the client side.

### 5–6. Consent

`OAuthConsent.tsx` reads the query params passed through from step 4, shows
the requesting client's name and its redirect URI, and on Approve/Deny calls
`POST /oauth/authorize/decision` with a CSRF token (this route needs
`requireAuth` + `requireCsrf`, since it's invoked by the logged-in user's
browser, not by the OAuth client itself). The server **re-validates**
`client_id`/`redirect_uri` again here rather than trusting what came back from
the browser round-trip.

On approval, a `codeChallenge`/`codeChallengeMethod` are persisted alongside a
freshly generated authorization code (hashed at rest, 60-second TTL,
`scopes` defaulting to `["mcp:tools"]` if none were requested). The consent
page never receives the raw code — the server computes the final redirect URL
(with `code`, `state`, and `iss` query params, per
`authorization_response_iss_parameter_supported: true`) and returns it as
JSON; the page then does `window.location.href = result.redirectTo`.

### 8. Token exchange

`POST /oauth/token` is a `discriminatedUnion` on `grant_type`:

- **`authorization_code`**: looks up the code by hash; rejects if missing,
  already consumed, or expired. Cross-checks `client_id` and `redirect_uri`
  against what was stored on the code (not just what the request claims).
  Verifies PKCE (`verifyPkce(code_verifier, storedChallenge)` —
  `auth/pkce.ts`, SHA-256 + base64url per RFC 7636 S256). Marks the code
  `consumedAt` (single-use), then issues a fresh access/refresh token pair.
- **`refresh_token`**: looks up by hash; rejects if missing, revoked, or
  expired. If the request includes `client_id`, it must match the token's
  client. **Rotation**: the used refresh token is revoked (`revokedAt` set)
  *before* the new pair is issued — a refresh token can only be used once.

Both branches call `issueTokenPair(clientId, userId, scopes)`: generates raw
access (`gtoat_...`) and refresh tokens, stores only their SHA-256 hashes,
sets `expiresAt` (1h / 90d respectively), and returns the raw values in the
response body (the only time either is visible in plaintext).

### 9–10. Using and refreshing

Access tokens (prefix `gtoat_`) are recognized and validated by
`authenticateMcpToken` in `mcp/auth.ts` — see [MCP
Protocol](04-MCP-Protocol.md#authentication-mcpautsauth) for that side.
Refresh happens transparently to the MCP client, driven by whatever OAuth
client library it uses (outside this server's control).

## Revocation

There is no dedicated `/oauth/revoke` endpoint. Revocation happens from the
admin side: **`POST /api/oauth-clients/:id/revoke`** revokes the client itself
plus, in one transaction, every non-revoked access token, non-revoked refresh
token, and un-consumed authorization code tied to it — effectively a hard
kill switch for one OAuth-connected application. Static `McpToken`s are
revoked individually via **`POST /api/tokens/:id/revoke`** (unrelated to this
OAuth system).
