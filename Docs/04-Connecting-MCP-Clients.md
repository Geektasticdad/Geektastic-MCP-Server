# Connecting an MCP Client

Before connecting any client, an admin must have added at least one
**Connection** to Geektastic Realms and confirmed it's **Healthy** — see
[Administrator Guide → Connections](02-Admin-Guide.md#connections).

There are two authentication paths, depending on the client:

| Client | Auth method | What you need |
|---|---|---|
| Claude Code CLI | Static Bearer token | A **Token** from **Tokens** (admin) |
| Claude Desktop / Claude.ai (Custom Connector) | OAuth 2.1 | Nothing pre-created in the common case — see below |
| Any other MCP client | Either, depending on client support | Token if it supports raw headers; OAuth otherwise |

## Claude Code CLI (Bearer token)

1. Ask an admin to create a token under **Tokens** and give it to you (see
   [Administrator Guide → Tokens](02-Admin-Guide.md#tokens)). Copy it — it's
   only shown once.
2. Run:
   ```
   claude mcp add --transport http geektastic https://<your-host>/mcp \
     --header "Authorization: Bearer <token>"
   ```
3. In a Claude Code session, the Geektastic tools should now be available (try
   asking it to search for a stat block).

## Claude Desktop / Claude.ai (Custom Connector — OAuth)

These clients only support OAuth, not a raw header, so the token flow above
doesn't apply here.

1. In Claude Desktop or on claude.ai, add a **Custom Connector** pointed at
   `https://<your-host>/mcp`.
2. Claude should automatically register itself with the server (Dynamic Client
   Registration) — no manual "OAuth Client ID" needed in the common case.
3. You'll be sent to this server's login page (if not already signed in), then
   to an **Authorize access** consent screen showing the connecting
   application's name. Click **Approve**.
4. You're redirected back to Claude, now connected.

If a connector's setup screen doesn't attempt auto-registration and instead
asks for a Client ID up front, an admin needs to create one manually under
**OAuth Clients** first — see
[Administrator Guide → OAuth Clients](02-Admin-Guide.md#oauth-clients).

### Revoking access later

- To cut off one specific token, an admin revokes it under **Tokens**.
- To cut off an entire OAuth-connected client (e.g. all of Claude.ai's access,
  or one no-longer-trusted custom client), an admin revokes it under **OAuth
  Clients** — this also invalidates every access/refresh token issued to it.

## What the client will see

Once connected, the MCP client can list and call whatever tools are currently
**enabled** (see [Administrator Guide → Tools](02-Admin-Guide.md#tools)) — see
[Geektastic Realms Tools Reference](05-GR-Tools-Reference.md) for the full
catalog. Every call is recorded in **Logs**, visible to any logged-in user.

Toggling a tool or a connection in the Web UI takes effect on the **next** MCP
request — no server restart, and no need to reconnect the client.
