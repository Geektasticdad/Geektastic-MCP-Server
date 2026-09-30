# Administrator Guide

Everything on this page requires an **admin** account. Admins see two extra
sidebar sections: **Configure** (**Connections**, with a link under it for each
connection) and **Access** (**Tokens**, **OAuth Clients**, **Users**). Each
connection's tools and prompts are managed on that connection's own page.

On a phone, the sidebar folds away behind the **Menu** button at the top.

## Connections

A **connection** is one configured link to an application — **Geektastic
Realms** or **Geektastic Family Tree** today, but the server is built to
support more apps later (see
[Tech_Docs/07-Connector-SDK.md](../Tech_Docs/07-Connector-SDK.md)). You can add
as many connections as you like, of either type — e.g. one Family Tree
connection per tree owner, or separate connections for separate Realms worlds.

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

### Adding a Geektastic Family Tree connection

1. Go to **Connections** → **Add connection**.
2. **Application**: choose "Geektastic Family Tree".
3. **Connection name**: any label you want (e.g. "McConnell Family Tree").
4. **Base URL**: the root URL of your Family Tree instance, e.g.
   `https://tree.example.com` — **do not** include `/api` or any path suffix;
   the server adds `/api/v1` itself.
5. **API key**: a personal API token generated from the **Admin** menu →
   **API Tokens** panel inside the Family Tree app itself (token management
   there is admin-only — you'll need an admin account on that tree). It's
   prefixed `gtk_`. Unlike Realms' per-world tokens, this token acts as the
   specific user who created it — every tool call sees exactly the trees and
   role (viewer/contributor/editor/admin) that user has, and a living
   person's private details (events, photos, notes, birth/death years) are
   only visible through editor/admin-role tokens — a viewer/contributor
   token gets a redacted profile, same as in the web app.
6. Click **Add connection**.

The API key is encrypted before it's stored and is never shown again in the UI
after creation — if you lose track of it, generate a new one in the Family
Tree app and update the connection.

**Recommended: create the token as read-only.** When creating the token in
Family Tree, its **access level** defaults to full read+write, but the app
itself suggests **read-only** for exactly this use case (a research
assistant that only needs to look things up) — a read-only token gets a
clean `403` on every `POST`/`PUT`/`DELETE` before it reaches any endpoint,
so an MCP client can never accidentally create, edit, or delete tree data no
matter what an AI assistant is asked to do with it. Only use a full-access
token if you actually want the assistant able to add/edit records. Tokens
can also be given an optional **expiry date** in Family Tree, after which
this connection's health check will start failing with "This API token has
expired." until you generate a new one.

After you add a connection, its page opens.

### A connection's page

The **Connections** page lists every connection as a card with its health —
**Healthy**, **Unhealthy** (with the error the application returned, such as a
bad API key or unreachable host), or **Disabled** — and how many of its tools
are on. The same status shows as a coloured dot next to each connection in the
sidebar. Click a card (or a sidebar link) to open that connection's page,
which has five tabs:

- **Overview** — health (with **Test now** to re-run the check), how many tools
  and prompts are on, and its last few tool calls. Click a call to open that
  tool.
- **Tools** — turn tools on and off, and try them. See [Tools](#tools) below.
- **Prompts** — turn this connection's prompts on and off. See
  [Prompts](#prompts) below.
- **Activity** — every tool and prompt call made through this connection, with
  the same filters as the main **Activity** page.
- **Settings** — see below.

### Settings

- **Details** — change the connection's name, base URL or API key. Leave the
  API key blank to keep the current one; you only need to enter it to replace
  it.
- **Disable / Enable connection** — a disabled connection's tools and prompts
  stop being offered to MCP clients and the Testing Playground immediately,
  without deleting anything. Use this instead of deleting when you just want to
  pause access temporarily.
- **Delete connection** — permanently removes the connection and its per-tool
  and per-prompt settings. Its call logs stay in **Activity**. This cannot be
  undone.

## Tools

A connection's **Tools** tab shows its tools as a grid. Each row is one kind of
thing the tools act on (Campaign,
Encounter, Person, Research task…), and its tools sit in three columns:
**Read** (list, get, search), **Create & edit**, and **Delete**. Each tool is a
pill; a struck-through, dashed pill is off. Hover a pill for its full tool name.

Click a pill to open that tool's **side panel**:

- **Enabled** switch — turn this one tool on or off.
- **Description** and **Inputs** — what the tool does and each input's type,
  whether it's required, and its allowed values.
- **Try it** — run the tool right there, exactly like the Testing Playground.
  Tools that create, change or delete data show a warning first, because
  they act on your real data. The tool (and its connection) must be on.
- **Recent calls** — its last 20 calls, from MCP clients and the playground,
  with status, duration and any error.

Clicking another pill switches the panel to that tool; **Esc** or **×** closes
it. The open tool is part of the page address
(`/connections/<id>/tools?tool=…`), so you can bookmark or share a link
straight to it. Links from before 1.6.3 (`/tools?tool=…`) still work.

- **Row switch** — the checkbox at the start of a row turns every tool in that
  row on or off. It shows a dash when only some of them are on. While you're
  searching or filtering, it only affects the tools you can see.
- **Enable all / Read-only / Disable all** — one-click presets for a whole
  connection. **Read-only** leaves only the Read column on, so an AI client can
  look things up but can't create, change or delete anything.
- **Search** matches tool names and row names, e.g. `encounter` or `delete`.
  The **All / Enabled / Disabled** filter narrows it further.
- A tool is enabled by default the moment its connection is added.
- Disabling a tool here removes it from what MCP clients see over `/mcp` **and**
  from the Testing Playground, immediately — no restart needed.

See [Geektastic Realms Tools Reference](05-GR-Tools-Reference.md) and
[Geektastic Family Tree Tools Reference](07-FT-Tools-Reference.md) for what
each tool actually does.

## Prompts

A connection's **Prompts** tab is the same idea as **Tools**, but for MCP
**prompts** — reusable, user-invocable conversation templates rather than
something the model calls on its own. It lists the connection's prompts with a
checkbox to enable or disable each one.

- A prompt is enabled by default the moment its connection is added.
- Disabling a prompt here removes it from what MCP clients see (`prompts/list`
  over `/mcp`) **and** from the Testing Playground, immediately.
- Today only **Geektastic Realms** connections contribute prompts — see
  [Geektastic Realms Prompts Reference](08-GR-Prompts-Reference.md) for what
  each one does.

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
connection — tokens aren't currently scoped per-connection. Use each
connection's **Tools** tab to control what's actually exposed.

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

## Activity (admin view)

**Activity** is covered in the [User Guide](03-User-Guide.md#activity) since
every logged-in user can see it — admins see exactly the same page, with
separate **Tool Calls** and **Prompt Calls** tabs. Use the **status** and
**name** filters to narrow down errors from a specific integration, or open a
connection's **Activity** tab to see only its calls.

## Recommended setup order for a fresh deployment

1. Log in as the bootstrap admin, change the password immediately (**Profile**).
2. Add your Geektastic Realms **Connection** and confirm it shows **Healthy**.
3. On the connection's **Tools** and **Prompts** tabs, disable anything you
   don't want exposed yet (**Read-only** is a good starting point).
4. Create a **Token** for each static MCP client (e.g. Claude Code CLI), or
   leave OAuth clients to self-register when Claude Desktop/Claude.ai connect.
5. Create accounts for any other team members under **Users**, choosing roles
   carefully — only give **admin** to people who should manage secrets and
   tokens.
6. Try a tool and a prompt end-to-end from the **Testing Playground** before
   handing a token to a real MCP client.
