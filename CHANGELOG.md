# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.3.0] - 2026-07-22

### Added
- **Structured spellcasting on `gr_create_statblock`/`gr_update_statblock`/
  `gr_get_statblock`** — GR shipped `spellcasting`/`spells` on stat blocks
  (Foundry VTT integration Stage 14) across `geektastic-realms` v1.25.0–v1.27.0,
  the last of which added the `/api/v1/statblocks` equivalent this connector talks
  to. `statblockSchema` now accepts an optional `spellcasting` object
  (`ability`/`save_dc_override`/`attack_override`) and an optional `spells[]` array
  (`name`/`level`/`usage_type`/`uses_per_day`, `usage_type` one of `slot`, `pact`,
  `at_will`, `per_day`). Same replace-all semantics as `features`/`items` — omitting
  `spells` on update clears it. See `Docs/05-GR-Tools-Reference.md` "Stat blocks".

## [1.2.0] - 2026-07-17

### Added
- **24 new Geektastic Realms tools** (`packages/connectors/src/geektastic/`),
  closing every gap tracked in `ROADMAP.md` Phase 7 against the GR API
  shipped in `geektastic-realms` v1.18.0–1.19.0:
  - **Roll tables**: `gr_list_roll_tables` / `gr_get_roll_table` /
    `gr_create_roll_table` / `gr_update_roll_table` — the single most
    generative-AI-friendly content type (wandering monsters, loot, rumors).
    List is lightweight (no rows); `gr_get_roll_table` returns full detail.
    Sending `rows` on update replaces the entire list, matching the
    `adversaries` semantics already established for encounters.
  - **Campaign writes**: `gr_create_campaign` / `gr_update_campaign`
    (campaigns were read-only through this connector until now).
  - **Individual reads**: `gr_get_encounter` / `gr_get_handout` — fetch one
    by id without pulling the whole section.
  - **Session logs**: `gr_list_sessions` / `gr_get_session` /
    `gr_create_session` / `gr_update_session` — write a session recap from a
    DM's notes, or read past sessions for "previously on…" continuity.
    Sending `sections_covered` on update replaces the entire list.
  - **World history**: `gr_list_eras` / `gr_get_era` / `gr_create_era` /
    `gr_update_era` and `gr_list_events` / `gr_get_event` / `gr_create_event` /
    `gr_update_event`. These require the connection's token to carry GR's new
    `history` resource scope (separate from `entries`/`modules`/`campaigns`/
    `foundry`) — a 403 here most likely means that scope hasn't been granted.
  - **Deletes**: `gr_delete_entry` / `gr_delete_section` /
    `gr_delete_encounter` / `gr_delete_handout` — all four are irreversible;
    disable them individually under **Tools** if a deployment shouldn't allow
    deletion at all.
  - `client.ts` gained matching typed methods/interfaces (`GrRollTable`,
    `GrSession`, `GrEra`, `GrHistoryEvent`, `GrOkResponse`, ...); `index.ts`
    gained typed Zod schemas for each new resource. Total GR tool count:
    22 → 46. See [Docs/05-GR-Tools-Reference.md](Docs/05-GR-Tools-Reference.md).

## [1.1.2] - 2026-07-16

### Added
- `ft_add_child` / `ft_update_child_relation`'s `father_relation`/
  `mother_relation` now accept `no_relation` alongside `birth`/`adopted`/
  `foster`/`step`/`unknown`, matching Geektastic Family Tree's `v0.18.0`
  addition. Unlike `unknown` (a relation exists but isn't known),
  `no_relation` means that parent isn't related to the child at all — the
  child stays linked into the family, but is excluded from that side's
  pedigree/descendant/relationship calculations on the Family Tree side.

## [1.1.1] - 2026-07-16

### Added
- `ft_list_notes` / `ft_create_note` now accept `surname` (a plain name
  string, e.g. `"McConnell"`) as an alternative owner to the existing
  `event_id`/`individual_id`/`family_id`/`source_id`/`repository_id`/
  `place_id`/`media_id` fields, matching Geektastic Family Tree's `v0.17.1`
  API addition (surname notes aren't a table-backed entity — matched against
  `names.surname` — so no new tool was needed, just a schema update in
  `packages/connectors/src/family-tree/index.ts`).

## [1.1.0] - 2026-07-16

### Added
- **Geektastic Family Tree connector** (`packages/connectors/src/family-tree/`),
  the second app connector after Geektastic Realms — registered in
  `packages/connectors/src/registry.ts`, no server-side changes needed since
  connections/tools/UI are all connector-agnostic already.
  - `family-tree/client.ts` — REST client against `geektastic-family-tree/docs/API.md`'s
    `/api/v1/*`, mirroring the Geektastic Realms client's shape (bearer token,
    JSON error parsing).
  - `family-tree/index.ts` — 69 `ft_*` tools covering trees, people (+ names,
    pedigree, descendants), families (+ children), events, places, sources,
    repositories, citations, notes, media (metadata/delete only — file upload
    is multipart/form-data and stays a web-app-only action), research tasks,
    DNA matches, and the search/relationship/gap/duplicate research tools.
  - `healthCheck` calls `GET /trees` and reports how many trees the
    connection's token can access.
  - `apps/web/src/pages/Connections.tsx` generalized its baseUrl+apiKey quick-add
    form (previously hardcoded to `geektastic-realms`) to a small per-connector
    lookup table so both known connector types get the guided form instead of
    the raw-JSON fallback.
  - New `Docs/07-FT-Tools-Reference.md`; `Docs/02-Admin-Guide.md` and
    `Docs/README.md` updated to cover adding a Family Tree connection.
  - Not yet exposed as tools: media upload/replace (multipart file upload).

## [1.0.5] - 2026-07-08

### Added
- `gr_create_encounter` / `gr_update_encounter` now accept an `adversaries`
  array (`{ entry_id, quantity }`) to set which creatures are in the fight,
  matching a corresponding change on the Geektastic Realms side
  (`Api\EncounterController` now validates and stores adversary links).
  Sending `adversaries` on update **replaces the whole list**, not a
  diff/append — find candidate `entry_id`s with `gr_search_statblocks` first.
  Every encounter returned by `gr_create_encounter`, `gr_update_encounter`,
  and `gr_get_section` now includes a resolved `adversaries` array
  (`{ entry_id, name, category, quantity }`).

## [1.0.4] - 2026-07-07

### Fixed
- `gr_get_module` could return a response large enough (hundreds of KB on a
  module with dozens of scenes) to exceed tool-response size limits outright,
  making some modules effectively unreadable through the MCP server. Matches a
  corresponding change on the Geektastic Realms side: `gr_get_module` now
  returns a lightweight outline (no `body_html`; encounters/handouts are
  name-only stubs) instead of the full tree.

### Added
- `gr_get_section` — fetch one Act/Chapter/Scene/Appendix's full content
  (body, complete encounters/handouts, one level of lightweight children) by
  module id + section id, now that `gr_get_module` no longer includes it.
- `gr_search_sections` — find a section by title across every module in a
  world without already knowing which module it's in.

## [1.0.3] - 2026-07-07

### Added
- **14 new tools** covering generic lore entries and adventure modules, against the
  Geektastic Realms API's new `gr-entry-v1`/`gr-module-v1` endpoints:
  - `gr_search_entries` / `gr_get_entry` / `gr_create_entry` / `gr_update_entry` —
    any category's lore entries (not just statblocks), with a `custom_fields`
    object keyed by each field's stable `key`. Zod schema uses a loose
    `z.record(z.string(), z.unknown())` for `custom_fields` since a category's
    field set is arbitrary and unknown at connector-build-time.
  - `gr_list_modules` / `gr_get_module` / `gr_create_module` / `gr_update_module`
  - `gr_create_section` / `gr_update_section` — Acts, Chapters, Scenes, Appendices
  - `gr_create_handout` / `gr_update_handout`
  - `gr_create_encounter` / `gr_update_encounter`
  - `client.ts` gained matching typed methods/interfaces (`GrEntryDetail`,
    `GrModuleDetail`, `GrSection`, `GrHandout`, `GrEncounter`, ...); `index.ts`
    gained typed Zod schemas for entry/module/section/handout/encounter (the
    fixed fields are fully known ahead of time, unlike `custom_fields`).
- Roll Tables remain unexposed — noted as a gap in `ROADMAP.md`.

## [1.0.2] - 2026-07-06

### Fixed
- `POST /api/auth/login` calls `req.session.regenerate()` (correctly, to prevent
  session fixation), which wipes the session's `csrfToken` along with everything
  else — but the frontend kept using its old cached CSRF token, so the very first
  CSRF-protected request after a login (e.g. the Testing Playground, or approving
  an OAuth consent screen reached via the post-login redirect) failed with
  "Invalid or missing CSRF token" until the page was reloaded. The login response
  now includes a freshly-generated `csrfToken` for the new session
  (`apps/server/src/api/auth.routes.ts`), and the client updates its cached token
  from that response immediately (`apps/web/src/api/client.ts`'s new
  `setCsrfToken`, called from `AuthContext.login()`) instead of waiting for a
  request to fail first.

## [1.0.1] - 2026-07-06

### Fixed
- `GET /oauth/consent` returned "Cannot GET /oauth/consent" instead of loading the
  consent screen. The page is client-side (React Router, `apps/web`), reached via a
  redirect from `GET /oauth/authorize`, but the server's SPA catch-all in
  `apps/server/src/index.ts` blanket-excluded every `/oauth/*` path (reserving that
  prefix for the OAuth API routes), so the request fell through to Express's default
  404 instead of serving `index.html`. Added an explicit `GET /oauth/consent` route
  ahead of that exclusion.

## [1.0.0] - 2026-07-06

### Added
- **OAuth 2.1 authorization server support**, so the MCP endpoint can be added as a
  Claude.ai / Claude Desktop "Custom Connector" (which requires OAuth — unlike Claude
  Code CLI, which already worked via a manually-configured static Bearer token and
  continues to work unchanged).
  - New endpoints: `/.well-known/oauth-authorization-server` and
    `/.well-known/oauth-protected-resource` (discovery), `POST /oauth/register`
    (Dynamic Client Registration, RFC 7591 — lets Claude self-register with no manual
    Client ID needed), `GET /oauth/authorize` + `POST /oauth/authorize/decision`
    (login + consent screen), `POST /oauth/token` (authorization_code and
    refresh_token grants, RFC 6749-shaped errors, form-urlencoded body).
  - PKCE (S256) is mandatory; public clients only for v1 (no client secret storage),
    matching how Claude's DCR/CIMD clients authenticate.
  - Missing/invalid MCP tokens now get a `WWW-Authenticate: Bearer
    resource_metadata="..."` header on the `401`, which Claude needs to auto-discover
    the OAuth flow — this is the one visible change to the existing static-token path
    and is harmless/additive (Claude Code CLI ignores headers it doesn't use).
  - New admin **OAuth Clients** page (mirrors the existing Tokens page) for manually
    pre-registering a client and getting a Client ID to paste into a connector's
    advanced settings, for cases where DCR doesn't apply.
  - New required env var `PUBLIC_BASE_URL` (the server's own externally-reachable
    origin) — needed for the discovery metadata and `iss` parameter, which must be
    absolute URLs. Added to `.env.example` and `docker-compose.yml`.
  - New Prisma models: `OAuthClient`, `OAuthAuthorizationCode`, `OAuthAccessToken`,
    `OAuthRefreshToken`; added `oauthAccessTokenId` to `ToolCallLog` (its existing
    `tokenId` column is FK'd to `McpToken` only and can't hold an OAuth token's id).
  - Added `scripts/verify-oauth.sh` — simulates the full DCR → authorize → consent →
    token exchange → `/mcp` call → refresh-rotation dance via curl, without needing a
    real Claude.ai account.
  - Verified with a local build (portable Node + full 4-package build chain + web
    typecheck, all exit 0) and a runtime smoke test of the compiled server (env
    validation and all new module imports resolve; fails only at the expected point —
    no local Postgres available here to run the full curl-based flow end-to-end, see
    `scripts/verify-oauth.sh` for that against a real deployment).
- Initial project scaffold implementing Phases 1–5 of [ROADMAP.md](ROADMAP.md):
  - pnpm monorepo: `apps/server`, `apps/web`, `packages/shared`, `packages/connectors`.
  - `AppConnector` / `ToolDefinition` abstraction and registry (`packages/connectors`) for
    plugging in applications beyond Geektastic Realms.
  - Geektastic Realms connector with a REST client and initial tool set (`gr_search_statblocks`,
    `gr_get_statblock`, `gr_create_statblock`, `gr_update_statblock`, `gr_list_campaigns`,
    `gr_get_campaign`) — later replaced with a real implementation, see "Changed" below.
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

### Changed
- Replaced the placeholder Geektastic Realms connector with a real
  implementation against `geektastic-realms/Docs/API.md`. Built on top of a
  parallel in-progress fix already on `main` (commit `88159a2`) that added a
  precise `gr-statblock-v1` Zod schema (`abilities`/`features`/`items` with
  the real enums from the docs) in place of the original catch-all — kept
  that schema and its `entry_id`/`category_id` snake_case field naming, and
  layered on:
  - All routes live under `/api/v1/` on the instance's root origin — the
    client now always prepends `/api/v1` itself, so the connection form's
    "Base URL" field just needs the instance's origin (no path suffix),
    with updated placeholder/help text to match.
  - `healthCheck` now surfaces the world name and Realms version in its
    detail message instead of a bare boolean.
  - Error responses now parse GR's real `{ ok: false, error: "..." }` body
    for a clean message instead of dumping raw response text.
  - `entry_id`/`category_id`/campaign `id` inputs use `z.coerce.number()` so
    an MCP client passing either a string or number both work.
  - Verified with a local build: the full four-package build chain and the
    web app's typecheck both exit 0.

### Fixed
- Session cookie never persisted after login (refresh required re-login; token
  creation, password change, and the logs page all failed with
  "Not authenticated"). The cookie's `secure` flag was tied to
  `NODE_ENV === "production"`, but the deployed stack sets `NODE_ENV=production`
  while exposing the app over plain HTTP with no TLS-terminating reverse proxy
  in front — browsers silently refuse to store or send back a `Secure` cookie
  over an insecure connection, so every request after login looked
  unauthenticated. Tied `cookie.secure` to `TRUST_PROXY` instead
  (`apps/server/src/auth/session.ts`): set `TRUST_PROXY=true` once a
  TLS-terminating reverse proxy is actually in front of the server to
  re-enable secure cookies.
- `Tokens.tsx` and `Logs.tsx` silently swallowed request errors (no visible
  feedback on a failed token creation or logs fetch), which is what made the
  cookie bug above look like nothing was happening. Both now surface the
  actual error message.
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

### Known gaps
- No Prisma migration history yet; the container runs `prisma db push` instead of
  `prisma migrate deploy` until an initial migration is generated and committed.
- No automated tests yet.
