import { createHash, timingSafeEqual } from "node:crypto";

/** Verifies a PKCE code_verifier against its S256 code_challenge (RFC 7636 §4.6). Only S256 is supported. */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
