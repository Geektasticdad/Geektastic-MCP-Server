# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Initial project scaffold implementing Phases 1–5 of [ROADMAP.md](ROADMAP.md):
  - pnpm monorepo: `apps/server`, `apps/web`, `packages/shared`, `packages/connectors`.
  - `AppConnector` / `ToolDefinition` abstraction and registry (`packages/connectors`) for
    plugging in applications beyond Geektastic Realms.
  - Geektastic Realms connector with a REST client and initial tool set (`gr_search_statblocks`,
    `gr_get_statblock`, `gr_create_statblock`, `gr_update_statblock`, `gr_list_campaigns`,
    `gr_get_campaign`) — endpoint paths are placeholders pending the real GR OpenAPI spec.
  - Express backend (`apps/server`) with Prisma/PostgreSQL: session-based multi-user auth with
    `admin`/`member` roles, admin-managed user accounts, AES-256-GCM secret encryption, CSRF
    protection, and rate limiting on login and the MCP endpoint.
  - MCP Streamable HTTP endpoint (`/mcp`) with bearer-token auth, dynamic tool aggregation from
    enabled connections/tools, and tool-call logging.
  - Management REST API (`/api`) covering auth, users, connections, tools, tokens, logs,
    dashboard summary, and a testing playground that reuses the same tool-handler path as `/mcp`.
  - React + Vite + Tailwind admin UI (`apps/web`): login, dashboard, connections, tools,
    tokens, testing playground, logs, users, and profile pages, with role-based visibility.
  - Multi-stage `Dockerfile` (`node:22-alpine`) and `docker-compose.yml` (app + official
    `postgres:16-alpine`) for Portainer-based deployment.
  - `ROADMAP.md` and `README.md` documenting architecture, decisions, setup, and known gaps.

### Known gaps
- No Prisma migration history yet; the container runs `prisma db push` instead of
  `prisma migrate deploy` until an initial migration is generated and committed.
- Scaffold has not been installed, type-checked, or run against a real database.
- Geektastic Realms connector endpoints are placeholders pending real API docs.
- No automated tests yet.
