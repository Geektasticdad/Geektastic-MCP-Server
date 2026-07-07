import { randomBytes } from "node:crypto";

/**
 * Raw-value generators for OAuth credentials. Hashing/comparison reuses
 * hashMcpToken/tokensMatch from tokens.ts (plain sha256, prefix-agnostic).
 */

export function generateAuthorizationCode(): string {
  return `gtoac_${randomBytes(32).toString("base64url")}`;
}

export function generateOAuthAccessToken(): string {
  return `gtoat_${randomBytes(32).toString("base64url")}`;
}

export function generateOAuthRefreshToken(): string {
  return `gtort_${randomBytes(32).toString("base64url")}`;
}
