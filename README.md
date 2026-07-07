# Geektastic MCP Server

A self-hosted **MCP (Model Context Protocol) server** with a **Web management UI** that
exposes the **Geektastic Realms** application to MCP clients (Claude Desktop/Code and
others). Built to deploy as a Docker stack via **Portainer**, and architected so
additional applications can be plugged in over time.

- **Integration:** Geektastic Realms REST/HTTP API
- **Stack:** TypeScript full-stack (Node + `@modelcontextprotocol/sdk` backend, React UI)
- **MCP transport:** Streamable HTTP (remote clients, bearer-token auth)
- **Storage:** PostgreSQL
- **Access:** multi-user Web login with roles (admin + member), admin-managed accounts
- **Web UI:** connections & secrets, per-tool enable/disable, logs & monitoring, tool
  testing playground, user management

## Status

Planning complete — implementation not started. See **[ROADMAP.md](ROADMAP.md)** for the
full architecture, data model, security model, Docker/Portainer deployment, and phased
delivery plan.

## Next step

Provide the Geektastic Realms **OpenAPI spec / endpoint docs + auth scheme** so the GR
connector's concrete MCP tools can be implemented (Phase 3 in the roadmap).
