# Geektastic MCP Server — Manual

This is the end-user and administrator manual for the Geektastic MCP Server: a
self-hosted server that exposes **Geektastic Realms** and **Geektastic Family
Tree** (and, in future, other applications) to MCP clients like Claude Code and
Claude Desktop, plus a Web UI for managing it.

For engineering/architecture documentation, see [`../Tech_Docs`](../Tech_Docs/README.md)
instead.

## Contents

1. [Getting Started](01-Getting-Started.md) — logging in for the first time, changing
   your password, understanding roles.
2. [Administrator Guide](02-Admin-Guide.md) — connections, tools, tokens, OAuth
   clients, users, logs. *(admin role only)*
3. [User Guide](03-User-Guide.md) — dashboard, testing playground, logs, profile.
   *(everyone)*
4. [Connecting an MCP Client](04-Connecting-MCP-Clients.md) — Claude Code CLI,
   Claude Desktop, Claude.ai Custom Connectors, and other MCP clients.
5. [Geektastic Realms Tools Reference](05-GR-Tools-Reference.md) — what each tool
   does, in plain language, with example inputs.
6. [Troubleshooting](06-Troubleshooting.md) — common problems and fixes.
7. [Geektastic Family Tree Tools Reference](07-FT-Tools-Reference.md) — what each
   tool does, in plain language.
8. [Geektastic Realms Prompts Reference](08-GR-Prompts-Reference.md) — the
   reusable session-prep/recap/statblock/encounter-building prompts.

## What this server does, in one paragraph

Administrators log into a Web UI to connect the server to a Geektastic Realms
world and/or a Geektastic Family Tree instance (each a base URL + API key),
then create **tokens** (or let an MCP client register itself via OAuth). Once
connected, an AI assistant like Claude can call "tools" — search stat blocks,
read adventure modules, create lore entries, look up people and relationships
in a family tree, and so on — directly against those apps, subject to
whichever tools an admin has left enabled. Every tool call is logged for
review.
