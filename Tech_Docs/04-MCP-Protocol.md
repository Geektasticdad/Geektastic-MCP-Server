# MCP Protocol

The `/mcp` route (`apps/server/src/mcp/http.ts`) implements the [MCP
Streamable HTTP
transport](https://modelcontextprotocol.io/) via
`@modelcontextprotocol/sdk`'s `StreamableHTTPServerTransport`, running in
**stateless mode**.

## Request flow

```
POST /mcp
  │
  ▼
mcpRateLimiter          (120 req/min, keyed by Authorization header, else IP)
  │
  ▼
authenticateMcpToken     (mcp/auth.ts)
  │
  ▼
buildMcpServer()          (mcp/server.ts) — fresh McpServer + tool registration
  │
  ▼
new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  │
  ▼
server.connect(transport); transport.handleRequest(req, res, req.body)
  │
  ▼
res.on("close") → transport.close() + server.close()
```

A brand new `McpServer` and transport are constructed **per request** — see
[Architecture → Stateless MCP design](01-Architecture.md#stateless-mcp-design)
for why. `GET /mcp` and `DELETE /mcp` both return `405` since stateless mode
doesn't support server-initiated streams or explicit session teardown.

## Authentication (`mcp/auth.ts`)

`authenticateMcpToken` reads `Authorization: Bearer <token>` and branches on
the token's prefix:

- **`gtoat_...`** → OAuth access token. Looked up by SHA-256 hash in
  `OAuthAccessToken`; rejected if missing, revoked, or past `expiresAt`.
  `lastUsedAt` is updated; `req.oauthAccessTokenId` is set for downstream
  logging.
- **Anything else** (expected: `gtmcp_...`) → static MCP token. Looked up by
  hash in `McpToken`; rejected if missing or revoked (no expiry). `lastUsedAt`
  updated; `req.mcpTokenId` set.

Either way, a missing/invalid token gets `401` with a `WWW-Authenticate:
Bearer resource_metadata="<PUBLIC_BASE_URL>/.well-known/oauth-protected-resource"`
header — this is what lets an OAuth-capable client (Claude) auto-discover the
authorization flow instead of just failing silently. Clients that only
understand static bearer tokens (Claude Code CLI) simply ignore the header.

## Tool aggregation and registration (`mcp/server.ts`)

`buildMcpServer(auth)`:

1. Calls `loadActiveConnections()` (`connections/service.ts`) — every
   **enabled** `AppConnection` row, with credentials decrypted and merged into
   `{ baseUrl, ...credentials }`, plus the set of tool names *not* explicitly
   disabled for that connection.
2. Calls `aggregateTools(connections)` (`@geektastic/connectors`) — flattens
   every connector's `getTools(config)` output across all active connections,
   filtered to each connection's enabled-tool set.
3. For each resulting tool, calls `server.registerTool(name, { description,
   inputSchema }, handlerWrapper)`. `inputSchema` is converted from the tool's
   Zod schema to the SDK's raw-shape format via `toRawShape()` — this assumes
   every tool declares a top-level `z.object({...})`; a connector that
   returned something else would silently get an empty (no-arg) schema.
4. The registered handler wraps the tool's real `handler(args, config)`:
   times the call, invokes it, and always logs the outcome via `logToolCall()`
   — on success (`result.isError` false/absent) or on a caught thrown error
   (converted into an `isError: true` result before returning, so MCP clients
   always get a well-formed tool result rather than a transport-level fault).

Because this whole sequence runs fresh per request, toggling a connection or a
tool in the Web UI is visible to the **very next** `/mcp` call — there is no
cache to invalidate and no server restart required.

## Tool result shape

Every tool handler returns a `ToolResult` (`packages/shared/src/index.ts`):

```ts
interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
```

Connector tools (see [Connector SDK](07-Connector-SDK.md)) uniformly
JSON-stringify their success payload into a single `text` content block
(`toResult()` in `geektastic/index.ts`), and turn any thrown error into an
`isError: true` result with the error message as the text (`toErrorResult()`).

## Rate limiting

`mcpRateLimiter` (`express-rate-limit`): 120 requests/minute, keyed by the raw
`Authorization` header value (falling back to IP if absent, which only matters
pre-auth since the route requires a token). This means the limit is per-token,
not global — one client can't exhaust the budget for another.
