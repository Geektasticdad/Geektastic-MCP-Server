import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin, requireCsrf } from "../auth/middleware.js";
import { encryptCredentials } from "../connections/service.js";
import { decryptSecret } from "../crypto/secrets.js";
import { getConnector, listConnectors } from "@geektastic/connectors";
import type { AppConnectionSummary } from "@geektastic/shared";

export const connectionsRouter = Router();
connectionsRouter.use(requireAdmin);

connectionsRouter.get("/connectors", (_req, res) => {
  res.json({
    connectors: listConnectors().map((c) => ({ id: c.id, displayName: c.displayName })),
  });
});

connectionsRouter.get("/", async (_req, res) => {
  const rows = await prisma.appConnection.findMany({ orderBy: { createdAt: "asc" } });
  const summaries: AppConnectionSummary[] = await Promise.all(
    rows.map(async (row) => {
      const connector = getConnector(row.appType);
      let health: AppConnectionSummary["health"];
      if (connector) {
        try {
          const credentials = decryptSecret<Record<string, unknown>>(row.encryptedCredentials);
          health = await connector.healthCheck({ baseUrl: row.baseUrl, ...credentials });
        } catch (err) {
          health = { ok: false, detail: err instanceof Error ? err.message : String(err) };
        }
      }
      return {
        id: row.id,
        appType: row.appType,
        name: row.name,
        baseUrl: row.baseUrl,
        enabled: row.enabled,
        createdAt: row.createdAt.toISOString(),
        health,
      };
    }),
  );
  res.json({ connections: summaries });
});

const createConnectionSchema = z.object({
  appType: z.string().min(1),
  name: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
});

connectionsRouter.post("/", requireCsrf, async (req, res) => {
  const parsed = createConnectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { appType, name, config } = parsed.data;
  const connector = getConnector(appType);
  if (!connector) {
    res.status(400).json({ error: `Unknown connector "${appType}"` });
    return;
  }
  const configCheck = connector.configSchema.safeParse(config);
  if (!configCheck.success) {
    res.status(400).json({ error: configCheck.error.message });
    return;
  }
  const { baseUrl, ...credentials } = config as { baseUrl: string; [key: string]: unknown };
  const row = await prisma.appConnection.create({
    data: {
      appType,
      name,
      baseUrl: String(baseUrl ?? ""),
      encryptedCredentials: encryptCredentials(credentials),
      createdById: req.session.userId,
    },
  });
  res.status(201).json({ id: row.id });
});

const updateConnectionSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

connectionsRouter.patch("/:id", requireCsrf, async (req, res) => {
  const parsed = updateConnectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await prisma.appConnection.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }

  const data: { name?: string; enabled?: boolean; baseUrl?: string; encryptedCredentials?: string } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
  if (parsed.data.config !== undefined) {
    const connector = getConnector(existing.appType);
    if (!connector) {
      res.status(400).json({ error: `Unknown connector "${existing.appType}"` });
      return;
    }
    const configCheck = connector.configSchema.safeParse(parsed.data.config);
    if (!configCheck.success) {
      res.status(400).json({ error: configCheck.error.message });
      return;
    }
    const { baseUrl, ...credentials } = parsed.data.config as { baseUrl: string; [key: string]: unknown };
    data.baseUrl = String(baseUrl ?? "");
    data.encryptedCredentials = encryptCredentials(credentials);
  }

  await prisma.appConnection.update({ where: { id: req.params.id }, data });
  res.status(204).end();
});

connectionsRouter.delete("/:id", requireCsrf, async (req, res) => {
  await prisma.appConnection.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

connectionsRouter.post("/:id/test", async (req, res) => {
  const row = await prisma.appConnection.findUnique({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  const connector = getConnector(row.appType);
  if (!connector) {
    res.status(400).json({ error: `Unknown connector "${row.appType}"` });
    return;
  }
  const credentials = decryptSecret<Record<string, unknown>>(row.encryptedCredentials);
  const result = await connector.healthCheck({ baseUrl: row.baseUrl, ...credentials });
  res.json(result);
});
