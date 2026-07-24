import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin, requireCsrf } from "../auth/middleware.js";
import { decryptSecret } from "../crypto/secrets.js";
import { getConnector } from "@geektastic/connectors";
import type { PromptSummary } from "@geektastic/shared";

export const promptsRouter = Router();
promptsRouter.use(requireAdmin);

promptsRouter.get("/", async (_req, res) => {
  const connections = await prisma.appConnection.findMany({ include: { promptSettings: true } });
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
