import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin, requireCsrf } from "../auth/middleware.js";
import { decryptSecret } from "../crypto/secrets.js";
import { describePrompt, getConnector } from "@geektastic/connectors";
import type { PromptDetail, PromptSummary } from "@geektastic/shared";

export const promptsRouter = Router();
promptsRouter.use(requireAdmin);

promptsRouter.get("/", async (req, res) => {
  const connectionId = typeof req.query.connectionId === "string" ? req.query.connectionId : undefined;
  const connections = await prisma.appConnection.findMany({
    where: connectionId ? { id: connectionId } : undefined,
    include: { promptSettings: true },
  });
  const summaries: PromptSummary[] = [];

  for (const row of connections) {
    const connector = getConnector(row.appType);
    if (!connector?.getPrompts) continue;
    const credentials = decryptSecret<Record<string, unknown>>(row.encryptedCredentials);
    const disabled = new Set(row.promptSettings.filter((p) => !p.enabled).map((p) => p.promptName));
    for (const prompt of connector.getPrompts({ baseUrl: row.baseUrl, ...credentials })) {
      summaries.push({
        connectionId: row.id,
        connectionName: row.name,
        name: prompt.name,
        ...describePrompt(prompt),
        description: prompt.description,
        enabled: !disabled.has(prompt.name),
        arguments: prompt.arguments,
      });
    }
  }
  res.json({ prompts: summaries });
});

const toggleSchema = z.object({
  connectionId: z.string().min(1),
  promptName: z.string().min(1),
  enabled: z.boolean(),
});

promptsRouter.post("/toggle", requireCsrf, async (req, res) => {
  const parsed = toggleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { connectionId, promptName, enabled } = parsed.data;
  await prisma.promptSetting.upsert({
    where: { connectionId_promptName: { connectionId, promptName } },
    update: { enabled },
    create: { connectionId, promptName, enabled },
  });
  res.status(204).end();
});

const bulkSchema = z.object({
  connectionId: z.string().min(1),
  changes: z
    .array(z.object({ promptName: z.string().min(1), enabled: z.boolean() }))
    .min(1)
    .max(500),
});

/** Several toggles in one transaction — the Prompts tab's Enable all / Disable all. */
promptsRouter.post("/bulk", requireCsrf, async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { connectionId, changes } = parsed.data;
  await prisma.$transaction(
    changes.map(({ promptName, enabled }) =>
      prisma.promptSetting.upsert({
        where: { connectionId_promptName: { connectionId, promptName } },
        update: { enabled },
        create: { connectionId, promptName, enabled },
      }),
    ),
  );
  res.status(204).end();
});

/**
 * One prompt for the Prompts tab's side panel, with its last 20 calls. Includes
 * disabled prompts and prompts on disabled connections. Calls are matched on
 * the exact prompt name (GET /api/prompt-logs matches partial names).
 */
promptsRouter.get("/:connectionId/:promptName", async (req, res) => {
  const { connectionId, promptName } = req.params;
  const row = await prisma.appConnection.findUnique({
    where: { id: connectionId },
    include: { promptSettings: { where: { promptName } } },
  });
  const connector = row ? getConnector(row.appType) : undefined;
  if (!row || !connector) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  const credentials = decryptSecret<Record<string, unknown>>(row.encryptedCredentials);
  const prompt = connector.getPrompts?.({ baseUrl: row.baseUrl, ...credentials }).find((p) => p.name === promptName);
  if (!prompt) {
    res.status(404).json({ error: "Prompt not found" });
    return;
  }

  const calls = await prisma.promptCallLog.findMany({
    where: { connectionId, promptName },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const detail: PromptDetail = {
    connectionId: row.id,
    connectionName: row.name,
    name: prompt.name,
    ...describePrompt(prompt),
    description: prompt.description,
    enabled: row.promptSettings[0]?.enabled ?? true,
    arguments: prompt.arguments,
    connectionEnabled: row.enabled,
    recentCalls: calls.map((call) => ({
      id: call.id,
      connectionId: call.connectionId,
      promptName: call.promptName,
      status: call.status,
      durationMs: call.durationMs,
      errorSummary: call.errorSummary,
      createdAt: call.createdAt.toISOString(),
    })),
  };
  res.json({ prompt: detail });
});
