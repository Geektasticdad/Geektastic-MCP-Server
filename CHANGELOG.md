# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed
- Docker build failing on `pnpm install` inside Portainer with
  `process "/bin/sh -c pnpm install --frozen-lockfile || pnpm install" did not
  complete successfully: exit code: 1`:
  - Upgraded Corepack before enabling it (`npm install -g corepack@latest`) —
    `node:22-alpine`'s bundled Corepack can predate npm's signing-key rotation,
    causing `pnpm install` to fail with "Cannot find matching keyid".
  - Pinned `"packageManager": "pnpm@11.10.0"` in the root `package.json` so
    Corepack installs a known version instead of resolving "latest" itself.
  - Installed `openssl` in the Alpine base image, required by Prisma's query
    engine binaries on musl.
  - Verified every pinned dependency version in every `package.json` actually
    exists on the npm registry and that all `package.json` files are valid
    JSON — ruled out as causes.
  - Removed the `--frozen-lockfile || install` fallback (there's no committed
    lockfile, so the first attempt always failed pointlessly and could muddy
    the build log with two merged error outputs) in favor of a single, direct
    `pnpm install` with bumped `fetch-retries`/`fetch-timeout` for resilience
    against flaky registry access. If the build still fails, the log will now
    show one unambiguous error instead of two conflated attempts.
  - After the Corepack upgrade was confirmed live (via a later build log that
    got past the earlier `apk add openssl` / `npm install -g corepack@latest`
    steps) and still failed at `pnpm install`, replaced Corepack-managed pnpm
    activation with a direct `npm install -g pnpm@11.10.0` in the Alpine base
    image. Corepack's fetch-then-verify-signature flow for activating a
    pinned package manager was still failing even with an upgraded Corepack;
    installing pnpm as a plain global npm package bypasses that verification
    path entirely.

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
