import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyPkce } from "../auth/pkce.js";
import { hashMcpToken } from "../auth/tokens.js";
import { generateOAuthAccessToken, generateOAuthRefreshToken } from "../auth/oauthTokens.js";

export const tokenRouter = Router();

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

const tokenRequestSchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1),
    redirect_uri: z.string().url(),
    client_id: z.string().min(1),
    code_verifier: z.string().min(1),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1),
    client_id: z.string().min(1).optional(),
  }),
]);

async function issueTokenPair(clientId: string, userId: string, scopes: string[]) {
  const rawAccessToken = generateOAuthAccessToken();
  const rawRefreshToken = generateOAuthRefreshToken();
  const now = Date.now();

  await prisma.oAuthAccessToken.create({
    data: {
      tokenHash: hashMcpToken(rawAccessToken),
      clientId,
      userId,
      scopes,
      expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
    },
  });
  await prisma.oAuthRefreshToken.create({
    data: {
      tokenHash: hashMcpToken(rawRefreshToken),
      clientId,
      userId,
      scopes,
      expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    },
  });

  return {
    access_token: rawAccessToken,
    token_type: "Bearer" as const,
    expires_in: ACCESS_TOKEN_TTL_MS / 1000,
    refresh_token: rawRefreshToken,
    scope: scopes.join(" "),
  };
}

tokenRouter.post("/oauth/token", async (req, res) => {
  const parsed = tokenRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", error_description: parsed.error.message });
    return;
  }
  const body = parsed.data;

  if (body.grant_type === "authorization_code") {
    const codeHash = hashMcpToken(body.code);
    const code = await prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash } });
    if (!code || code.consumedAt || code.expiresAt < new Date()) {
      res.status(400).json({ error: "invalid_grant", error_description: "Unknown, expired, or used code" });
      return;
    }
    if (code.clientId !== body.client_id || code.redirectUri !== body.redirect_uri) {
      res.status(400).json({ error: "invalid_grant", error_description: "client_id or redirect_uri mismatch" });
      return;
    }
    const client = await prisma.oAuthClient.findUnique({ where: { id: code.clientId } });
    if (!client || client.revokedAt) {
      res.status(400).json({ error: "invalid_client" });
      return;
    }
    if (!verifyPkce(body.code_verifier, code.codeChallenge)) {
      res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
      return;
    }

    await prisma.oAuthAuthorizationCode.update({ where: { id: code.id }, data: { consumedAt: new Date() } });
    const tokens = await issueTokenPair(code.clientId, code.userId, code.scopes);
    res.json(tokens);
    return;
  }

  // grant_type === "refresh_token"
  const refreshHash = hashMcpToken(body.refresh_token);
  const refreshToken = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: refreshHash } });
  if (!refreshToken || refreshToken.revokedAt || refreshToken.expiresAt < new Date()) {
    res.status(400).json({ error: "invalid_grant", error_description: "Unknown, revoked, or expired refresh token" });
    return;
  }
  if (body.client_id && body.client_id !== refreshToken.clientId) {
    res.status(400).json({ error: "invalid_grant", error_description: "client_id mismatch" });
    return;
  }
  const client = await prisma.oAuthClient.findUnique({ where: { id: refreshToken.clientId } });
  if (!client || client.revokedAt) {
    res.status(400).json({ error: "invalid_client" });
    return;
  }

  // Rotation: revoke the used refresh token before issuing a new pair.
  await prisma.oAuthRefreshToken.update({ where: { id: refreshToken.id }, data: { revokedAt: new Date() } });
  const tokens = await issueTokenPair(refreshToken.clientId, refreshToken.userId, refreshToken.scopes);
  res.json(tokens);
});
