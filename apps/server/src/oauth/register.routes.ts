import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db.js";

/**
 * RFC 7591 Dynamic Client Registration. Unauthenticated by design (matches
 * spec expectations — this is how Claude registers itself automatically
 * without a human present), but rate-limited to deter junk-client spam.
 */
export const registerRouter = Router();

const registerRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const registerSchema = z.object({
  client_name: z.string().min(1).max(200),
  redirect_uris: z.array(z.string().url()).min(1),
  token_endpoint_auth_method: z.enum(["none"]).optional(),
  grant_types: z.array(z.string()).optional(),
});

registerRouter.post("/oauth/register", registerRateLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_client_metadata", error_description: parsed.error.message });
    return;
  }
  const { client_name, redirect_uris } = parsed.data;

  const client = await prisma.oAuthClient.create({
    data: {
      clientName: client_name,
      redirectUris: redirect_uris,
      tokenEndpointAuthMethod: "none",
      registrationSource: "dcr",
    },
  });

  res.status(201).json({
    client_id: client.id,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: client.grantTypes,
    response_types: ["code"],
  });
});
