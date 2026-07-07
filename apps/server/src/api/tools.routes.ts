import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin, requireCsrf } from "../auth/middleware.js";
import { decryptSecret } from "../crypto/secrets.js";
import { getConnector } from "@geektastic/connectors";
import type { ToolSummary } from "@geektastic/shared";

export const toolsRouter = Router();
toolsRouter.use(requireAdmin);

toolsRouter.get("/", async (_req, res) => {
  const connections = await prisma.appConnection.findMany({ include: { toolSettings: true } });
  const summaries: ToolSummary[] = [];

  for (const row of connections) {
    const connector = getConnector(row.appType);
    if (!connector) continue;
    const credentials = decryptSecret<Record<string, unknown>>(row.encryptedCredentials);
    const disabled = new Set(row.toolSettings.filter((t) => !t.enabled).map((t) => t.toolName));
    for (const tool of connector.getTools({ baseUrl: row.baseUrl, ...credentials })) {
      summaries.push({
        connectionId: row.id,
        connectionName: row.name,
        name: tool.name,
        description: tool.description,
        enabled: !disabled.has(tool.name),
      });
    }
  }
  res.json({ tools: summaries });
});

const toggleSchema = z.object({
  connectionId: z.string().min(1),
  toolName: z.string().min(1),
  enabled: z.boolean(),
});

toolsRouter.post("/toggle", requireCsrf, async (req, res) => {
  const parsed = toggleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { connectionId, toolName, enabled } = parsed.data;
  await prisma.toolSetting.upsert({
    where: { connectionId_toolName: { connectionId, toolName } },
    update: { enabled },
    create: { connectionId, toolName, enabled },
  });
  res.status(204).end();
});
