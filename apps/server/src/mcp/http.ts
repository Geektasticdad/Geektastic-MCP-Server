import { Router } from "express";
import rateLimit from "express-rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authenticateMcpToken } from "./auth.js";
import { buildMcpServer } from "./server.js";

export const mcpRouter = Router();

// Keyed by bearer token (falls back to IP pre-auth) so one misbehaving client
// can't exhaust the limit for everyone else.
const mcpRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.header("Authorization") ?? req.ip ?? "unknown",
});
mcpRouter.use(mcpRateLimiter);

// Stateless Streamable HTTP: a new McpServer + transport per request, so tool
// availability always reflects the latest Web UI connection/toggle state.
mcpRouter.post("/", authenticateMcpToken, async (req, res) => {
  try {
    const server = await buildMcpServer({ mcpTokenId: req.mcpTokenId, oauthAccessTokenId: req.oauthAccessTokenId });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: err instanceof Error ? err.message : "Internal error" },
        id: null,
      });
    }
  }
});

mcpRouter.get("/", authenticateMcpToken, (_req, res) => {
  res.status(405).json({ error: "Method not allowed in stateless mode" });
});

mcpRouter.delete("/", authenticateMcpToken, (_req, res) => {
  res.status(405).json({ error: "Method not allowed in stateless mode" });
});
