import { env } from "../env.js";

/**
 * This server acts as a combined OAuth 2.1 authorization server + resource
 * server (both roles hosted in the same app — explicitly allowed by the MCP
 * Authorization spec). All URLs below are relative to PUBLIC_BASE_URL.
 */

export function issuer(): string {
  return env.PUBLIC_BASE_URL;
}

export function mcpResourceUrl(): string {
  return `${env.PUBLIC_BASE_URL}/mcp`;
}

export function protectedResourceMetadataUrl(): string {
  return `${env.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource`;
}

/** RFC 8414 Authorization Server Metadata. */
export function buildAuthorizationServerMetadata() {
  return {
    issuer: issuer(),
    authorization_endpoint: `${env.PUBLIC_BASE_URL}/oauth/authorize`,
    token_endpoint: `${env.PUBLIC_BASE_URL}/oauth/token`,
    registration_endpoint: `${env.PUBLIC_BASE_URL}/oauth/register`,
    scopes_supported: ["mcp:tools"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
  };
}

/** RFC 9728 Protected Resource Metadata. */
export function buildProtectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: ["mcp:tools"],
  };
}
