# User Guide

These pages are available to every logged-in account, admin or member.

## Overview

The landing page after login (**Overview** in the sidebar). It refreshes automatically every 15 seconds and
shows:

- **Connections** — how many are configured.
- **Active MCP tokens** — count of non-revoked tokens.
- **Prompt calls** — total prompt calls ever made through this server.
- **Recent error rate** — the error percentage among the last 10 tool calls
  server-wide.
- **Connection health** — a per-connection Healthy/Unavailable indicator (the
  same check as the admin "Test now" button). Admins can click a connection to
  open its page.
- **Recent tool calls** — the last 10 calls across the whole server: tool name,
  success/error, duration, and timestamp.

Use this as your at-a-glance "is everything working" view.

## Search (Ctrl+K)

Press **Ctrl+K** (**⌘K** on a Mac), or click **Search** at the top of the
sidebar, to jump anywhere by typing part of its name. It finds pages, and every
tool by name, what it acts on, or what it does — e.g. `research delete` or
`get entry`. Use **↑**/**↓** to move, **Enter** to open, **Esc** to close.

- **Admins** also see connections and prompts. Picking a tool opens its side
  panel on its connection's **Tools** tab, where you can read about it, try it,
  or turn it on or off. Turned-off tools are marked **off**.
- **Members** see the tools they're allowed to run. Picking one opens it in
  the Testing Playground, ready to fill in.

## Testing Playground

Lets you run any *enabled* tool or prompt from your browser, without needing
an MCP client at all — useful for verifying something works, understanding
what arguments it expects, or debugging why an AI assistant's call failed.
The **Tools** / **Prompts** toggle at the top switches between the two.

**Tools:**
1. Pick a tool from the dropdown (grouped by connection), or find it with
   **Ctrl+K**. Only enabled tools on enabled connections appear here — same
   list an MCP client would see. The chosen tool is part of the page address,
   so you can bookmark it.
2. The form below has one field per input the tool accepts, with each field's
   type, a red **\*** if it's required, and its description:
   - numbers get a number box;
   - inputs with a fixed set of values (like a status or priority) get a
     dropdown;
   - true/false inputs get a checkbox, or a dropdown with **(not set)** when
     they're optional;
   - objects and lists get a JSON box. The grey text in it shows every field
     you can include; **Insert required fields** fills in just the required
     ones for you to complete.

   Optional fields you leave blank aren't sent at all. If a required field is
   empty, a number isn't a number, or JSON doesn't parse, the field is
   highlighted and nothing runs.
3. Click **Run tool**. The result (or error) is shown below, exactly as an
   MCP client would receive it, with JSON formatted for reading and a **Copy
   result** button.
4. **Show MCP request** shows the `tools/call` request an MCP client would
   send with your inputs, with a **Copy request** button — handy for bug
   reports or for testing another client.

**Prompts:** same idea, but every argument is a plain text field (MCP prompt
arguments are always strings), and running one shows the messages the prompt
would hand to an MCP client — see
[Geektastic Realms Prompts Reference](08-GR-Prompts-Reference.md) for what
each one does.

Important: **this actually calls the real Geektastic Realms API** — running
`gr_create_statblock`, or a prompt that reads real module/session data, really
touches your world. It's not a sandbox. Every call here is logged in **Activity**
just like a call from Claude would be, so you can cross-check.

## Activity

**Activity** shows the history of every tool and prompt call made through this
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
