# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
# Prisma's query engine binaries need OpenSSL on musl-based Alpine (both at
# `prisma generate`/postinstall time and at runtime).
RUN apk add --no-cache openssl
# Install pnpm directly via npm instead of via Corepack. Corepack's
# fetch-then-verify-signature flow for activating a package manager kept
# failing here even after upgrading Corepack itself (see CHANGELOG.md) —
# installing pnpm as a plain global npm package bypasses that verification
# path entirely.
RUN npm install -g pnpm@11.10.0
WORKDIR /app

# ---- deps: install once, cached across builds ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/connectors/package.json packages/connectors/package.json
# No pnpm-lock.yaml is committed yet, so --frozen-lockfile would always fail;
# install directly instead. Retries/timeout are bumped defensively in case the
# build environment has a flaky path to the npm registry.
RUN pnpm config set fetch-retries 5 \
 && pnpm config set fetch-timeout 300000 \
 && pnpm install

# ---- build: compile shared -> connectors -> web -> server ----
FROM deps AS build
COPY . .
RUN pnpm --filter @geektastic/server exec prisma generate
RUN pnpm --filter @geektastic/shared build \
 && pnpm --filter @geektastic/connectors build \
 && pnpm --filter @geektastic/web build \
 && pnpm --filter @geektastic/server build

# ---- runtime: only what's needed to run the server ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=build /app/apps/server/package.json apps/server/package.json
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/connectors/package.json packages/connectors/package.json
RUN pnpm config set fetch-retries 5 \
 && pnpm config set fetch-timeout 300000 \
 && pnpm install --prod

COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/public apps/server/public
COPY --from=build /app/apps/server/prisma apps/server/prisma
COPY --from=build /app/apps/server/generated apps/server/generated
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/connectors/dist packages/connectors/dist

WORKDIR /app/apps/server
EXPOSE 8080

# No Prisma migration history is checked in yet (see ROADMAP.md open items), so
# schema is synced with `db push` rather than `migrate deploy`. Switch to
# `prisma migrate deploy` once real migrations exist under apps/server/prisma/migrations.
CMD ["sh", "-c", "node_modules/.bin/prisma db push --skip-generate --accept-data-loss && node dist/index.js"]
