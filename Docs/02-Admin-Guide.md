# Administrator Guide

Everything on this page requires an **admin** account. All admin pages live
under the sidebar's "Admin" section: **Connections**, **Tools**, **Tokens**,
**OAuth Clients**, **Users**.

## Connections

A **connection** is one configured link to an application — currently just
**Geektastic Realms**, but the server is built to support more apps later (see
[Tech_Docs/07-Connector-SDK.md](../Tech_Docs/07-Connector-SDK.md)).

### Adding a Geektastic Realms connection

1. Go to **Connections** → **Add connection**.
2. **Application**: leave as "Geektastic Realms".
3. **Connection name**: any label you want (e.g. "Main Campaign World"). You'll
   see this name throughout the UI and in tool-call logs.
4. **Base URL**: the root URL of your Geektastic Realms instance, e.g.
   `https://realms.example.com` — **do not** include `/api` or any path suffix;
   the server adds `/api/v1` itself.
5. **API key**: a per-world Bearer token generated from that world's **General
   API Access** panel inside Geektastic Realms itself. It's prefixed `grapi_`.
6. Click **Add connection**.

The API key is encrypted before it's stored and is never shown again in the UI
after creation — if you lose track of it, generate a new one in Geektastic
Realms and update the connection.

### Managing an existing connection

Each connection card shows a live health indicator (rechecked automatically):

- **Healthy** — the server successfully reached Geektastic Realms and shows the
  world name and Realms version.
- Anything else — the error message returned by Geektastic Realms (bad API key,
  unreachable host, etc.).

Buttons per connection:
- **Test** — re-runs the health check on demand and shows the result inline.
- **Disable / Enable** — a disabled connection's tools stop being offered to MCP
  clients and the Testing Playground immediately, without deleting anything.
  Use this instead of deleting when you just want to pause access temporarily.
- **Delete** — permanently removes the connection (and its per-tool enable/
  disable settings). This cannot be undone from the UI.

## Tools

The **Tools** page lists every tool contributed by every connection, grouped by
connection name, with a checkbox to enable or disable each one individually.

- A tool is enabled by default the moment its connection is added.
- Disabling a tool here removes it from what MCP clients see over `/mcp` **and**
  from the Testing Playground, immediately — no restart needed.
- This is the lever to use if you want to, say, allow read/search tools but
  block create/update tools for now, or hide a tool you're not ready to expose.

See [Geektastic Realms Tools Reference](05-GR-Tools-Reference.md) for what each
tool actually does.

## Tokens

**Tokens** are the credentials a static, non-OAuth MCP client (like the Claude
Code CLI) uses to authenticate to `/mcp` as `Authorization: Bearer <token>`.

- **Create token**: give it a descriptive name (e.g. "Claude Desktop — Jason's
  laptop", "Claude Code CLI"). The raw token is shown **exactly once**,
  immediately after creation — copy it now. If you lose it, revoke it and
  create a new one; the server only ever stores a hash, it cannot show you the
  raw value again.
- **Revoke**: immediately invalidates a token. Any MCP client still using it
  gets rejected on its next request. Revocation cannot be undone — issue a new
  token if the client needs continued access.
- The table shows each token's creation time and **last used** time, so you can
  spot stale tokens worth revoking.

Anyone who has a valid token can call every *enabled* tool on every *enabled*
connection — tokens aren't currently scoped per-connection. Use the Tools page
to control what's actually exposed.

## OAuth Clients

This page only matters for **OAuth-based** MCP clients — Claude Desktop and
Claude.ai's Custom Connector, which require OAuth 2.1 rather than a static
token (unlike Claude Code CLI, which uses a Token as above).

In the common case **you don't need to do anything here**: when you add this
server as a Custom Connector in Claude Desktop/Claude.ai, it registers itself
automatically (Dynamic Client Registration) and you'll just get a login +
consent screen. Entries with **Source: DCR** in the table are these
self-registered clients.

Register a client manually here only if a connector's setup screen doesn't
attempt auto-registration and instead asks you to paste in a Client ID:

1. **Client name**: something recognizable, e.g. "Claude.ai".
2. **Redirect URI(s)**: one per line. For Claude.ai, this is
   `https://claude.ai/api/mcp/auth_callback`.
3. Submit, then copy the generated **Client ID** into the connector's "OAuth
   Client ID" field. There is no client secret — this server only issues
   public, PKCE-based clients (see
   [Tech_Docs/05-OAuth2.md](../Tech_Docs/05-OAuth2.md) for why).

**Revoke** on a client immediately invalidates every access token, refresh
token, and pending authorization code issued to it.

## Users

Admin-only user management — there is no self-service sign-up.

### Creating a user

Go to **Users** → **Add user**, fill in username, email, an initial password
(min 8 characters), and a role (**member** or **admin**), then submit. The new
user is created with `mustChangePassword` set, so they'll be prompted to change
that initial password the first time they visit **Profile**. Tell them the
username and initial password out of band (chat, in person — not this UI).

### Managing existing users

Per row in the table:
- **Role** dropdown — promote/demote between member and admin. You cannot
  change your own role from this control (it's disabled on your own row).
- **Status** button — toggle **Active** / **Disabled**. Disabling immediately
  blocks that user from logging in (existing sessions stop being accepted on
  their next request). You cannot disable your own account.
- **Reset password** — prompts you for a new password and sets it immediately,
  flagging the account to require a password change on next login. Use this
  when a user is locked out.

There's no "delete user" — disable the account instead. This preserves the
audit trail (who created which connections/tokens/OAuth clients) since those
records reference the user.

## Logs (admin view)

Logs are covered in the [User Guide](03-User-Guide.md#logs) since every
logged-in user can see them — admins see exactly the same page. Use the
**status** and **tool name** filters to narrow down errors from a specific
integration.

## Recommended setup order for a fresh deployment

1. Log in as the bootstrap admin, change the password immediately (**Profile**).
2. Add your Geektastic Realms **Connection** and confirm it shows **Healthy**.
3. Review **Tools** and disable anything you don't want exposed yet.
4. Create a **Token** for each static MCP client (e.g. Claude Code CLI), or
   leave OAuth clients to self-register when Claude Desktop/Claude.ai connect.
5. Create accounts for any other team members under **Users**, choosing roles
   carefully — only give **admin** to people who should manage secrets and
   tokens.
6. Try a tool end-to-end from the **Testing Playground** before handing a token
   to a real MCP client.
