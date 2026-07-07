import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { hashMcpToken } from "../auth/tokens.js";
import { protectedResourceMetadataUrl } from "../oauth/metadata.js";

declare global {
  namespace Express {
    interface Request {
      mcpTokenId?: string;
      oauthAccessTokenId?: string;
    }
  }
}

function unauthorized(res: Response, error: string) {
  res
    .status(401)
    .set("WWW-Authenticate", `Bearer resource_metadata="${protectedResourceMetadataUrl()}"`)
    .json({ error });
}

export async function authenticateMcpToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header("Authorization");
  const raw = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;
  if (!raw) {
    unauthorized(res, "Missing Authorization: Bearer <token>");
    return;
  }

  const tokenHash = hashMcpToken(raw);

  if (raw.startsWith("gtoat_")) {
    const oauthToken = await prisma.oAuthAccessToken.findUnique({ where: { tokenHash } });
    if (!oauthToken || oauthToken.revokedAt || oauthToken.expiresAt < new Date()) {
      unauthorized(res, "Invalid or expired token");
      return;
    }
    await prisma.oAuthAccessToken.update({ where: { id: oauthToken.id }, data: { lastUsedAt: new Date() } });
    req.oauthAccessTokenId = oauthToken.id;
    next();
    return;
  }

  const token = await prisma.mcpToken.findUnique({ where: { tokenHash } });
  if (!token || token.revokedAt) {
    unauthorized(res, "Invalid or revoked token");
    return;
  }

  await prisma.mcpToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
  req.mcpTokenId = token.id;
  next();
}
