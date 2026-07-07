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
  - Bypassing Corepack still hit the identical `pnpm install` failure, which
    finally pointed at the real cause: pnpm 10+ blocks dependency
    postinstall/build scripts by default (Prisma's query-engine download,
    esbuild's binary fetch via vite/tsx) unless approved via
    `pnpm approve-builds` — a prompt that can't run in a non-interactive
    Docker build, so `pnpm install` fails outright. Added
    `dangerouslyAllowAllBuilds: true` to `pnpm-workspace.yaml` (acceptable for
    this private, self-hosted, single-operator deployment; can be tightened to
    an explicit `allowBuilds:` allowlist later).

- Docker build failing at the `tsc`/`vite` build step (`pnpm --filter
  @geektastic/shared build && ...`, exit code 2). Installed a local, portable
  Node.js to actually run the build and see real compiler errors instead of
  guessing further, which surfaced several genuine bugs never caught before
  since this code had never been compiled:
  - Removed the unnecessary TypeScript `references` field from
    `packages/connectors/tsconfig.json` and `apps/server/tsconfig.json`
    (`TS6306: Referenced project ... must have setting "composite": true`).
    Project references require `composite: true` on every referenced project
    and are only meaningful for `tsc --build` orchestration; our build script
    invokes `tsc -p` per package directly in dependency order, so cross-package
    types already resolve fine via each package's compiled `dist/index.d.ts`.
  - Added `@types/node` to `packages/connectors` (needed for the global
    `fetch`/`RequestInit` types used in the Geektastic Realms REST client).
  - Added `@types/pg` to `apps/server`.
  - Set `"declaration": false` on `apps/server`'s `tsconfig.json` — it's an
    application, not a library other packages import, so it doesn't need to
    emit `.d.ts` files. This also fixed a batch of
    `TS2742: The inferred type of 'X' cannot be named` errors on every
    exported Express `Router`, caused by pnpm's nested `node_modules` layout
    making some transitive `@types` packages unnameable in declaration output.
  - Fixed `ensureCsrfToken`'s parameter type in `apps/server/src/auth/session.ts`:
    `express-session`'s `Session` class does not itself extend `SessionData`
    (only `req.session`, typed as the intersection `Session &
    Partial<SessionData>`, does) — the augmented `csrfToken` field wasn't
    visible through the bare `Session` type.
  - Fixed the Express `Request` augmentation in `apps/server/src/mcp/auth.ts`:
    augmenting `"express-serve-static-core"` by module name failed to resolve
    (`TS2664`) since it's only a transitive dependency; switched to the
    standard `declare global { namespace Express { interface Request {...} } }`
    pattern.
  - Added an index signature to `ToolResult` in `packages/shared/src/index.ts`
    so it structurally matches the MCP SDK's expected tool-handler return type
    (`TS2345`/`TS2742` on `server.registerTool`'s callback).
  - Generated and committed `pnpm-lock.yaml` (there wasn't one before) and
    switched the Dockerfile back to `pnpm install --frozen-lockfile` in both
    the `deps` and `runtime` stages for reproducible builds.
  - Verified end-to-end: a clean `pnpm install`, `prisma generate`, and the
    exact four-package build chain from the Dockerfile all complete with exit
    code 0, and the compiled server starts up and fails only at the expected
    point (no local Postgres available) rather than on any code/import error.

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
