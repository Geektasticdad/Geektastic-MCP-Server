import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { hashMcpToken } from "../auth/tokens.js";

declare global {
  namespace Express {
    interface Request {
      mcpTokenId?: string;
    }
  }
}

export async function authenticateMcpToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header("Authorization");
  const raw = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;
  if (!raw) {
    res.status(401).json({ error: "Missing Authorization: Bearer <token>" });
    return;
  }

  const tokenHash = hashMcpToken(raw);
  const token = await prisma.mcpToken.findUnique({ where: { tokenHash } });
  if (!token || token.revokedAt) {
    res.status(401).json({ error: "Invalid or revoked token" });
    return;
  }

  await prisma.mcpToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
  req.mcpTokenId = token.id;
  next();
}
