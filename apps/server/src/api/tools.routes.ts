import { Router } from "express";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { prisma } from "../db.js";
import { requireAdmin, requireCsrf } from "../auth/middleware.js";
import { decryptSecret } from "../crypto/secrets.js";
import { describeTool, getConnector } from "@geektastic/connectors";
import type { JsonSchemaObject, ToolDetail, ToolSummary } from "@geektastic/shared";

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
        ...describeTool(tool),
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

const bulkSchema = z.object({
  connectionId: z.string().min(1),
  changes: z
    .array(z.object({ toolName: z.string().min(1), enabled: z.boolean() }))
    .min(1)
    .max(500),
});

/** Several toggles in one transaction — the Tools page's row switches and presets. */
toolsRouter.post("/bulk", requireCsrf, async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { connectionId, changes } = parsed.data;
  await prisma.$transaction(
    changes.map(({ toolName, enabled }) =>
      prisma.toolSetting.upsert({
        where: { connectionId_toolName: { connectionId, toolName } },
        update: { enabled },
        create: { connectionId, toolName, enabled },
      }),
    ),
  );
  res.status(204).end();
});

/**
 * One tool for the Tools page's side panel: its input schema and its last 20
 * calls. Unlike GET /api/playground/tools, this includes disabled tools and
 * tools on disabled connections, so the panel can show them before they're
 * turned on. Calls are matched on the exact tool name (GET /api/logs matches
 * partial names).
 */
toolsRouter.get("/:connectionId/:toolName", async (req, res) => {
  const { connectionId, toolName } = req.params;
  const row = await prisma.appConnection.findUnique({
    where: { id: connectionId },
    include: { toolSettings: { where: { toolName } } },
  });
  const connector = row ? getConnector(row.appType) : undefined;
  if (!row || !connector) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  const credentials = decryptSecret<Record<string, unknown>>(row.encryptedCredentials);
  const tool = connector.getTools({ baseUrl: row.baseUrl, ...credentials }).find((t) => t.name === toolName);
  if (!tool) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }

  const calls = await prisma.toolCallLog.findMany({
    where: { connectionId, toolName },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const detail: ToolDetail = {
    connectionId: row.id,
    connectionName: row.name,
    name: tool.name,
    description: tool.description,
    ...describeTool(tool),
    enabled: row.toolSettings[0]?.enabled ?? true,
    connectionEnabled: row.enabled,
    inputSchema: zodToJsonSchema(tool.inputSchema) as JsonSchemaObject,
    recentCalls: calls.map((call) => ({
      id: call.id,
      connectionId: call.connectionId,
      toolName: call.toolName,
      status: call.status,
      durationMs: call.durationMs,
      errorSummary: call.errorSummary,
      createdAt: call.createdAt.toISOString(),
    })),
  };
  res.json({ tool: detail });
});
