import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { decryptSecret } from "../crypto/secrets.js";
import { getConnector } from "@geektastic/connectors";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/summary", async (_req, res) => {
  const [connections, activeTokenCount, recentLogs] = await Promise.all([
    prisma.appConnection.findMany(),
    prisma.mcpToken.count({ where: { revokedAt: null } }),
    prisma.toolCallLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const connectionHealth = await Promise.all(
    connections.map(async (row) => {
      const connector = getConnector(row.appType);
      if (!connector || !row.enabled) {
        return { id: row.id, name: row.name, enabled: row.enabled, ok: false, detail: "disabled" };
      }
      try {
        const credentials = decryptSecret<Record<string, unknown>>(row.encryptedCredentials);
        const health = await connector.healthCheck({ baseUrl: row.baseUrl, ...credentials });
        return { id: row.id, name: row.name, enabled: row.enabled, ...health };
      } catch (err) {
        return {
          id: row.id,
          name: row.name,
          enabled: row.enabled,
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  const errorCount = recentLogs.filter((l) => l.status === "error").length;

  res.json({
    connections: connectionHealth,
    activeTokenCount,
    recentErrorRate: recentLogs.length > 0 ? errorCount / recentLogs.length : 0,
    recentLogs: recentLogs.map((l) => ({
      id: l.id,
      toolName: l.toolName,
      status: l.status,
      durationMs: l.durationMs,
      createdAt: l.createdAt.toISOString(),
    })),
  });
});
