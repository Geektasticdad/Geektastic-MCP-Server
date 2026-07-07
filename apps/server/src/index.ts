import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { env } from "./env.js";
import { sessionMiddleware } from "./auth/session.js";
import { bootstrapAdmin } from "./auth/bootstrap.js";
import { apiRouter } from "./api/router.js";
import { mcpRouter } from "./mcp/http.js";
import { wellKnownRouter } from "./oauth/wellKnown.routes.js";
import { oauthRouter } from "./oauth/router.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

async function main() {
  await bootstrapAdmin();

  const app = express();
  if (env.TRUST_PROXY) app.set("trust proxy", 1);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // OAuth discovery metadata: no body parsing, no session, must be reachable
  // pre-auth by any client attempting the OAuth flow.
  app.use(wellKnownRouter);

  // The /mcp endpoint authenticates via bearer token, not the session cookie,
  // so it's mounted before the session middleware.
  app.use("/mcp", express.json(), mcpRouter);

  app.use(express.json({ limit: "2mb" }));
  app.use(sessionMiddleware);
  // Routes below already declare their full "/oauth/..." paths, so this is
  // mounted at the root (like wellKnownRouter above), not at an "/oauth" prefix.
  // /oauth/authorize + /oauth/authorize/decision need the session cookie (above);
  // /oauth/token needs form-urlencoded bodies (RFC 6749), which the global
  // express.json() above doesn't parse — scoped here rather than globally so it
  // doesn't affect /api.
  app.use(express.urlencoded({ extended: false }), oauthRouter);
  app.use("/api", apiRouter);

  app.use(express.static(publicDir));
  app.get(/^(?!\/api|\/mcp|\/oauth|\/\.well-known).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.listen(env.PORT, () => {
    console.log(`Geektastic MCP Server listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
