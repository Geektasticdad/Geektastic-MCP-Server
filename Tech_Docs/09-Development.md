# Development

## Prerequisites

- Node.js 22+
- pnpm (pin: `pnpm@11.10.0`, per root `package.json`'s `packageManager` field
  — `corepack enable` will provide it, though see the Docker note in
  [Deployment](08-Deployment.md#dockerfile-dockerfile--multi-stage-build) if
  Corepack activation gives you trouble)
- A reachable PostgreSQL instance

## First-time setup

```bash
cp .env.example .env
# Fill in: DB_PASSWORD, APP_ENCRYPTION_KEY (openssl rand -hex 32),
# SESSION_SECRET, ADMIN_USERNAME/EMAIL/PASSWORD, PUBLIC_BASE_URL

pnpm install
pnpm prisma:generate   # generates apps/server/generated/prisma
pnpm prisma:push       # syncs schema.prisma to your Postgres — no migrations exist yet
```

## Running in dev mode

Two terminals:

```bash
pnpm dev:server   # apps/server: tsx watch src/index.ts, port 8080
pnpm dev:web      # apps/web: vite dev server
```

The Vite dev server proxies `/api` and `/health` to `localhost:8080` (see
`apps/web/vite.config.ts`) — you browse the Vite port, not 8080 directly, in
this mode.

## Building for production

```bash
pnpm build
# equivalent to:
pnpm --filter ./packages/shared build \
  && pnpm --filter ./packages/connectors build \
  && pnpm --filter ./apps/web build \
  && pnpm --filter ./apps/server build

pnpm --filter @geektastic/server start   # node dist/index.js
```

Build order is load-bearing: `shared` has no internal deps; `connectors` and
`web` both depend on `shared`'s compiled `dist/index.d.ts`; `server` depends
on `connectors`' compiled output, and also serves `web`'s build output
(`apps/web`'s `build` script targets `--outDir ../server/public` directly).

This is exactly the sequence the Dockerfile's `build` stage runs — see
[Deployment](08-Deployment.md).

## Other scripts

| Script | What it does |
|---|---|
| `pnpm lint` | `pnpm -r lint` — currently a no-op per-package (`"lint": "echo \"(no lint configured)\""` in every `package.json`); no linter is actually wired up yet. |
| `pnpm typecheck` | `pnpm -r typecheck` — runs `tsc --noEmit` in every package; this **is** real and worth running before committing. |
| `pnpm prisma:migrate:dev` (server) | Would generate a tracked migration — not currently used in the deployed flow (see "Known gaps" below). |
| `pnpm prisma:migrate:deploy` (server) | Would apply tracked migrations — the Dockerfile currently runs `db push` instead. |
| `scripts/verify-oauth.sh <host> <admin-user> <admin-pass>` | curl-based end-to-end OAuth flow check against a real deployment — see [Deployment](08-Deployment.md#verifying-a-deployment-end-to-end). |

## Repo/package layout

See [Architecture → Monorepo layout](01-Architecture.md#monorepo-layout) for
the annotated directory tree. Quick package map:

| Package | Depends on | Publishes to |
|---|---|---|
| `@geektastic/shared` | — | consumed by `web`, `connectors`, `server` |
| `@geektastic/connectors` | `@geektastic/shared` | consumed by `server` |
| `@geektastic/web` | `@geektastic/shared` | built into `apps/server/public` |
| `@geektastic/server` | `@geektastic/connectors`, `@geektastic/shared` | the actual deployable |

Root `tsconfig.base.json`: ES2022 target, `NodeNext` module resolution,
`strict: true`, `noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns`/
`noFallthroughCasesInSwitch` all on. Each package's own `tsconfig.json`
extends this. Notably, cross-package TypeScript project references
(`references` field) were deliberately **removed** — the root `build` script
invokes `tsc -p` per package directly in dependency order, so types resolve
via each package's already-compiled `dist/index.d.ts` rather than needing
`tsc --build` orchestration (which would require `composite: true`
everywhere).

## Known gaps

Carried over verbatim from `README.md`/`ROADMAP.md` — check those files
directly for the current status, as this list can go stale:

- **No tracked Prisma migration history.** `apps/server/prisma/migrations/`
  doesn't exist; the container runs `prisma db push --accept-data-loss`
  instead of `prisma migrate deploy`. To fix: run `pnpm --filter
  @geektastic/server exec prisma migrate dev --name init` against a real dev
  database once the schema is considered stable, commit the generated
  `migrations/` folder, and switch the Dockerfile's `CMD` to `prisma migrate
  deploy` (already a defined script: `prisma:migrate:deploy`).
- **No automated tests.** No test runner is configured in any package. Auth,
  CSRF, rate limiting, the OAuth flow, and every connector tool are currently
  verified only by manual walkthroughs (`ROADMAP.md`'s "Verification"
  section) and `scripts/verify-oauth.sh`.
- **No linter configured**, despite `pnpm lint` existing as a script (it's a
  no-op echo in every package currently).
- **A full security review of secret handling has not been completed** — see
  [Security → Known gaps](06-Security.md#known-gaps--things-not-yet-done).

## Where to look when extending the system

| I want to... | Start here |
|---|---|
| Add a new tool to the Geektastic Realms connector | `packages/connectors/src/geektastic/index.ts` (tool def + Zod schema) and `client.ts` (REST call) — see [Connector SDK](07-Connector-SDK.md) |
| Add a whole new connected application | `packages/connectors/src/<newapp>/`, implement `AppConnector`, register in `src/registry.ts` — see [Connector SDK](07-Connector-SDK.md) |
| Add a new `/api` management endpoint | New/existing router under `apps/server/src/api/`, mounted in `api/router.ts` |
| Add a new Web UI page | `apps/web/src/pages/`, route it in `apps/web/src/App.tsx`, add a nav link in `apps/web/src/components/Layout.tsx` |
| Change the data model | `apps/server/prisma/schema.prisma`, then `pnpm prisma:generate` + `pnpm prisma:push` (or start real migrations — see "Known gaps" above) |
| Change session/CSRF/token behavior | `apps/server/src/auth/` — see [Security](06-Security.md) |
| Change the OAuth flow | `apps/server/src/oauth/` — see [OAuth 2.1](05-OAuth2.md) |
