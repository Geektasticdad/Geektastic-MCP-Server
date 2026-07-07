import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { env } from "./env.js";
import { sessionMiddleware } from "./auth/session.js";
import { bootstrapAdmin } from "./auth/bootstrap.js";
import { apiRouter } from "./api/router.js";
import { mcpRouter } from "./mcp/http.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

async function main() {
  await bootstrapAdmin();

  const app = express();
  if (env.TRUST_PROXY) app.set("trust proxy", 1);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // The /mcp endpoint authenticates via bearer token, not the session cookie,
  // so it's mounted before the session middleware.
  app.use("/mcp", express.json(), mcpRouter);

  app.use(express.json({ limit: "2mb" }));
  app.use(sessionMiddleware);
  app.use("/api", apiRouter);

  app.use(express.static(publicDir));
  app.get(/^(?!\/api|\/mcp).*/, (_req, res) => {
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
