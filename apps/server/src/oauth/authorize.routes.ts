import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireCsrf } from "../auth/middleware.js";
import { generateAuthorizationCode } from "../auth/oauthTokens.js";
import { hashMcpToken } from "../auth/tokens.js";
import { issuer } from "./metadata.js";

export const authorizeRouter = Router();

const AUTH_CODE_TTL_MS = 60_000;

interface ValidatedClient {
  id: string;
  redirectUri: string;
}

/** Loads the client and validates redirect_uri against its registered list. Returns null if invalid. */
async function validateClientAndRedirect(clientId: unknown, redirectUri: unknown): Promise<ValidatedClient | null> {
  if (typeof clientId !== "string" || typeof redirectUri !== "string") return null;
  const client = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
  if (!client || client.revokedAt) return null;
  if (!client.redirectUris.includes(redirectUri)) return null;
  return { id: client.id, redirectUri };
}

function redirectWithError(redirectUri: string, state: unknown, error: string, description?: string) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (description) url.searchParams.set("error_description", description);
  if (typeof state === "string") url.searchParams.set("state", state);
  return url.toString();
}

// GET /oauth/authorize — browser-navigated. Validates the request, then either
// bounces to /login (not authenticated) or /oauth/consent (authenticated).
authorizeRouter.get("/oauth/authorize", async (req, res) => {
  const { response_type, client_id, redirect_uri, code_challenge, code_challenge_method, state, resource, scope } =
    req.query;

  // client_id/redirect_uri must be validated FIRST and strictly — until both are
  // confirmed, there's no safe place to redirect an error to (open-redirect risk).
  const validated = await validateClientAndRedirect(client_id, redirect_uri);
  if (!validated) {
    res.status(400).json({ error: "invalid_request", error_description: "Unknown client_id or redirect_uri" });
    return;
  }

  if (response_type !== "code") {
    res.redirect(302, redirectWithError(validated.redirectUri, state, "unsupported_response_type"));
    return;
  }
  if (typeof code_challenge !== "string" || code_challenge_method !== "S256") {
    res.redirect(
      302,
      redirectWithError(validated.redirectUri, state, "invalid_request", "code_challenge (S256) is required"),
    );
    return;
  }

  const client = await prisma.oAuthClient.findUnique({ where: { id: validated.id } });
  const consentParams = new URLSearchParams({
    client_id: validated.id,
    clientName: client!.clientName,
    redirect_uri: validated.redirectUri,
    code_challenge,
    code_challenge_method: "S256",
  });
  if (typeof state === "string") consentParams.set("state", state);
  if (typeof resource === "string") consentParams.set("resource", resource);
  if (typeof scope === "string") consentParams.set("scope", scope);

  if (!req.session.userId) {
    const returnTo = `/oauth/consent?${consentParams.toString()}`;
    res.redirect(302, `/login?returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }

  res.redirect(302, `/oauth/consent?${consentParams.toString()}`);
});

const decisionSchema = z.object({
  approve: z.boolean(),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(1),
  code_challenge_method: z.literal("S256"),
  state: z.string().optional(),
  resource: z.string().optional(),
  scope: z.string().optional(),
});

// POST /oauth/authorize/decision — called by the OAuthConsent React page (session
// cookie + CSRF token), never by the OAuth client itself.
authorizeRouter.post("/oauth/authorize/decision", requireAuth, requireCsrf, async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", error_description: parsed.error.message });
    return;
  }
  const { approve, client_id, redirect_uri, code_challenge, code_challenge_method, state, resource, scope } =
    parsed.data;

  // Re-validate — never trust the client/redirect_uri pairing from the browser round-trip alone.
  const validated = await validateClientAndRedirect(client_id, redirect_uri);
  if (!validated) {
    res.status(400).json({ error: "invalid_request", error_description: "Unknown client_id or redirect_uri" });
    return;
  }

  if (!approve) {
    res.json({ redirectTo: redirectWithError(validated.redirectUri, state, "access_denied") });
    return;
  }

  const rawCode = generateAuthorizationCode();
  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: hashMcpToken(rawCode),
      clientId: validated.id,
      userId: req.session.userId!,
      redirectUri: validated.redirectUri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      resource: resource ?? null,
      scopes: scope ? scope.split(" ").filter(Boolean) : ["mcp:tools"],
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  });

  const url = new URL(validated.redirectUri);
  url.searchParams.set("code", rawCode);
  if (state) url.searchParams.set("state", state);
  url.searchParams.set("iss", issuer());
  res.json({ redirectTo: url.toString() });
});
