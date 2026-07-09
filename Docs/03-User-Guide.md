# User Guide

These pages are available to every logged-in account, admin or member.

## Dashboard

The landing page after login. It refreshes automatically every 15 seconds and
shows:

- **Connections** — how many are configured.
- **Active MCP tokens** — count of non-revoked tokens.
- **Recent error rate** — the error percentage among the last 10 tool calls
  server-wide.
- **Connection health** — a per-connection Healthy/Unavailable indicator (the
  same check as the admin "Test" button).
- **Recent tool calls** — the last 10 calls across the whole server: tool name,
  success/error, duration, and timestamp.

Use this as your at-a-glance "is everything working" view.

## Testing Playground

Lets you run any *enabled* tool from your browser, without needing an MCP
client at all — useful for verifying a tool works, understanding what
arguments it expects, or debugging why an AI assistant's call failed.

1. Go to **Testing Playground**.
2. Pick a tool from the dropdown (listed as `connection name / tool name`).
   Only enabled tools on enabled connections appear here — same list an MCP
   client would see.
3. The form below auto-generates one field per input the tool accepts, along
   with each field's description straight from the tool's schema. Object/array
   fields expect raw JSON in a textarea; everything else is a plain text input
   (numbers and booleans are coerced automatically).
4. Click **Run tool**. The raw result (or error) is shown below, exactly as an
   MCP client would receive it.

Important: **this actually calls the real Geektastic Realms API** — running
`gr_create_statblock` here really creates a stat block. It's not a sandbox.
Every call here is logged in **Logs** just like a call from Claude would be,
so you can cross-check.

## Logs

**Logs** shows the history of every tool call made through this server —
whether from a real MCP client (Claude) or from the Testing Playground.

Each row shows: tool name, status (success/error), duration in milliseconds,
error detail (truncated, if it failed), and timestamp. Filter by **status**
(success/error) or by typing part of a **tool name**. The list auto-refreshes
every 10 seconds.

This is your first stop when something "isn't working" — check whether the
call even reached the server, and if it did, what error came back from
Geektastic Realms.

## Profile

- View your username, email, and role.
- **Change password**: requires your current password plus a new one (min 8
  characters). If an admin set your password for you, you'll see a banner
  prompting you to do this the first time you visit.

## What you can't do as a member

If your account is a **member**, the sidebar simply won't show Connections,
Tools, Tokens, OAuth Clients, or Users — those are admin-only (see
[Administrator Guide](02-Admin-Guide.md)). If you need something changed there
(a new connection, a token, your role, a new teammate account), ask an admin.
