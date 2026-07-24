import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import type { PromptCallLogEntry } from "@geektastic/shared";

export const promptLogsRouter = Router();
promptLogsRouter.use(requireAuth);

const querySchema = z.object({
  status: z.enum(["success", "error"]).optional(),
  promptName: z.string().optional(),
  connectionId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

promptLogsRouter.get("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { status, promptName, connectionId, limit, cursor } = parsed.data;

  const rows = await prisma.promptCallLog.findMany({
    where: {
      status,
      promptName: promptName ? { contains: promptName, mode: "insensitive" } : undefined,
      connectionId: connectionId ?? undefined,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const logs: PromptCallLogEntry[] = rows.map((row) => ({
    id: row.id,
    connectionId: row.connectionId,
    promptName: row.promptName,
    status: row.status,
    durationMs: row.durationMs,
    errorSummary: row.errorSummary,
    createdAt: row.createdAt.toISOString(),
  }));

  res.json({ logs, nextCursor: rows.length === limit ? rows[rows.length - 1]?.id : null });
});
