import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "gtmcp";

/** Generates a new raw MCP token. Only shown to the user once, at creation time. */
export function generateMcpToken(): string {
  return `${TOKEN_PREFIX}_${randomBytes(32).toString("base64url")}`;
}

export function hashMcpToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function tokensMatch(hashA: string, hashB: string): boolean {
  const a = Buffer.from(hashA, "hex");
  const b = Buffer.from(hashB, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
