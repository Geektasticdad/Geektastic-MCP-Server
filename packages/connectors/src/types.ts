import type { ZodType } from "zod";
import type { ToolResult } from "@geektastic/shared";

/**
 * Decrypted configuration for a single app connection, as stored in
 * `app_connections` (baseUrl + credential fields merged into one object).
 * The shape is connector-specific; `configSchema` on the connector validates it.
 */
export type ConnectorConfig = Record<string, unknown>;

export interface HealthCheckResult {
  ok: boolean;
  detail?: string;
}

export interface ToolDefinition {
  /** Globally unique, namespaced tool name, e.g. "gr_search_statblocks". */
  name: string;
  description: string;
  inputSchema: ZodType;
  handler(input: unknown, cfg: ConnectorConfig): Promise<ToolResult>;
}

export interface PromptArgumentDefinition {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptMessage {
  role: "user" | "assistant";
  /** Text-only content for v1 — covers every prompt built so far. */
  text: string;
}

export interface PromptResult {
  description?: string;
  messages: PromptMessage[];
}

export interface PromptDefinition {
  /** Globally unique, namespaced prompt name, e.g. "gr_session_prep". */
  name: string;
  description: string;
  arguments?: PromptArgumentDefinition[];
  /**
   * MCP prompt arguments are always plain strings on the wire
   * (unlike a tool's arbitrary-JSON input) — handlers parse/coerce internally.
   */
  handler(args: Record<string, string>, cfg: ConnectorConfig): Promise<PromptResult>;
}

/**
 * Everything needed to plug a new application into the MCP server.
 * Implement this interface to add an app beyond Geektastic Realms —
 * the registry, Web UI, tokens, and logging all work automatically
 * once a connector is registered.
 */
export interface AppConnector {
  /** Stable identifier stored as `app_connections.appType`, e.g. "geektastic-realms". */
  id: string;
  displayName: string;
  /** Validates the connection form fields (baseUrl, credentials, ...) submitted in the UI. */
  configSchema: ZodType;
  /** Used by the dashboard to show per-connection status. Should not throw. */
  healthCheck(cfg: ConnectorConfig): Promise<HealthCheckResult>;
  /** Tool set contributed by this connector for a given connection's config. */
  getTools(cfg: ConnectorConfig): ToolDefinition[];
  /** Prompt set contributed by this connector, if any — optional so not every connector needs one. */
  getPrompts?(cfg: ConnectorConfig): PromptDefinition[];
}
