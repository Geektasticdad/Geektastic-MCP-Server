import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin, requireCsrf } from "../auth/middleware.js";
import { generateMcpToken, hashMcpToken } from "../auth/tokens.js";
import type { McpTokenSummary } from "@geektastic/shared";

export const tokensRouter = Router();
tokensRouter.use(requireAdmin);

function toSummary(row: {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}): McpTokenSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

tokensRouter.get("/", async (_req, res) => {
  const rows = await prisma.mcpToken.findMany({ orderBy: { createdAt: "asc" } });
  res.json({ tokens: rows.map(toSummary) });
});

const createTokenSchema = z.object({ name: z.string().min(1).max(100) });

tokensRouter.post("/", requireCsrf, async (req, res) => {
  const parsed = createTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rawToken = generateMcpToken();
  const row = await prisma.mcpToken.create({
    data: {
      name: parsed.data.name,
      tokenHash: hashMcpToken(rawToken),
      createdById: req.session.userId,
    },
  });
  // The raw token is only ever returned here, at creation time.
  res.status(201).json({ token: toSummary(row), rawToken });
});

tokensRouter.post("/:id/revoke", requireCsrf, async (req, res) => {
  await prisma.mcpToken.update({ where: { id: req.params.id }, data: { revokedAt: new Date() } });
  res.status(204).end();
});
