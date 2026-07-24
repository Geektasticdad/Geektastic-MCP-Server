# User Guide

These pages are available to every logged-in account, admin or member.

## Dashboard

The landing page after login. It refreshes automatically every 15 seconds and
shows:

- **Connections** — how many are configured.
- **Active MCP tokens** — count of non-revoked tokens.
- **Prompt calls** — total prompt calls ever made through this server.
- **Recent error rate** — the error percentage among the last 10 tool calls
  server-wide.
- **Connection health** — a per-connection Healthy/Unavailable indicator (the
  same check as the admin "Test" button).
- **Recent tool calls** — the last 10 calls across the whole server: tool name,
  success/error, duration, and timestamp.

Use this as your at-a-glance "is everything working" view.

## Testing Playground

Lets you run any *enabled* tool or prompt from your browser, without needing
an MCP client at all — useful for verifying something works, understanding
what arguments it expects, or debugging why an AI assistant's call failed.
The **Tools** / **Prompts** toggle at the top switches between the two.

**Tools:**
1. Pick a tool from the dropdown (listed as `connection name / tool name`).
   Only enabled tools on enabled connections appear here — same list an MCP
   client would see.
2. The form below auto-generates one field per input the tool accepts, along
   with each field's description straight from the tool's schema. Object/array
   fields expect raw JSON in a textarea; everything else is a plain text input
   (numbers and booleans are coerced automatically).
3. Click **Run tool**. The raw result (or error) is shown below, exactly as an
   MCP client would receive it.

**Prompts:** same idea, but every argument is a plain text field (MCP prompt
arguments are always strings), and running one shows the messages the prompt
would hand to an MCP client — see
[Geektastic Realms Prompts Reference](08-GR-Prompts-Reference.md) for what
each one does.

Important: **this actually calls the real Geektastic Realms API** — running
`gr_create_statblock`, or a prompt that reads real module/session data, really
touches your world. It's not a sandbox. Every call here is logged in **Logs**
just like a call from Claude would be, so you can cross-check.

## Logs

**Logs** shows the history of every tool and prompt call made through this
server — whether from a real MCP client (Claude) or from the Testing
Playground. Use the **Tool Calls** / **Prompt Calls** tabs to switch between
them.

Each row shows: name, status (success/error), duration in milliseconds, error
detail (truncated, if it failed), and timestamp. Filter by **status**
(success/error) or by typing part of a name. The list auto-refreshes every 10
seconds.

This is your first stop when something "isn't working" — check whether the
call even reached the server, and if it did, what error came back from
Geektastic Realms. A failed prompt call shows up as an error here too, even
though the MCP client sees it as a protocol-level error rather than a normal
result (prompts have no soft "partial success" state the way tools do).

## Profile

- View your username, email, and role.
- **Change password**: requires your current password plus a new one (min 8
  characters). If an admin set your password for you, you'll see a banner
  prompting you to do this the first time you visit.

## What you can't do as a member

If your account is a **member**, the sidebar simply won't show Connections,
Tools, Prompts, Tokens, OAuth Clients, or Users — those are admin-only (see
[Administrator Guide](02-Admin-Guide.md)). If you need something changed there
(a new connection, a token, your role, a new teammate account), ask an admin.
