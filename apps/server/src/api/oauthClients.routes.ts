import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin, requireCsrf } from "../auth/middleware.js";
import type { OAuthClientSummary } from "@geektastic/shared";

export const oauthClientsRouter = Router();
oauthClientsRouter.use(requireAdmin);

function toSummary(row: {
  id: string;
  clientName: string;
  redirectUris: string[];
  registrationSource: string;
  createdAt: Date;
  revokedAt: Date | null;
}): OAuthClientSummary {
  return {
    id: row.id,
    clientName: row.clientName,
    redirectUris: row.redirectUris,
    registrationSource: row.registrationSource === "dcr" ? "dcr" : "manual",
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

oauthClientsRouter.get("/", async (_req, res) => {
  const rows = await prisma.oAuthClient.findMany({ orderBy: { createdAt: "asc" } });
  res.json({ clients: rows.map(toSummary) });
});

const createClientSchema = z.object({
  clientName: z.string().min(1).max(200),
  redirectUris: z.array(z.string().url()).min(1),
});

oauthClientsRouter.post("/", requireCsrf, async (req, res) => {
  const parsed = createClientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const row = await prisma.oAuthClient.create({
    data: {
      clientName: parsed.data.clientName,
      redirectUris: parsed.data.redirectUris,
      tokenEndpointAuthMethod: "none",
      registrationSource: "manual",
      createdById: req.session.userId,
    },
  });
  res.status(201).json({ client: toSummary(row) });
});

oauthClientsRouter.post("/:id/revoke", requireCsrf, async (req, res) => {
  const { id } = req.params;
  const now = new Date();
  await prisma.$transaction([
    prisma.oAuthClient.update({ where: { id }, data: { revokedAt: now } }),
    prisma.oAuthAccessToken.updateMany({ where: { clientId: id, revokedAt: null }, data: { revokedAt: now } }),
    prisma.oAuthRefreshToken.updateMany({ where: { clientId: id, revokedAt: null }, data: { revokedAt: now } }),
    prisma.oAuthAuthorizationCode.updateMany({ where: { clientId: id, consumedAt: null }, data: { consumedAt: now } }),
  ]);
  res.status(204).end();
});
