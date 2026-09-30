export type UserRole = "admin" | "member";
export type UserStatus = "active" | "disabled";

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AppConnectionSummary {
  id: string;
  appType: string;
  /** The connector's display name, e.g. "Geektastic Realms". */
  appName: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  createdAt: string;
  health?: { ok: boolean; detail?: string };
}

export interface ToolSummary {
  connectionId: string;
  connectionName: string;
  name: string;
  description: string;
  /** Row in the Tools grid, e.g. "Encounter". */
  category: string;
  /** Short label within the row, e.g. "create". */
  action: string;
  access: "read" | "write" | "delete";
  enabled: boolean;
}

/** The subset of JSON Schema the Web UI reads to build a tool's input form. */
export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchemaProperty;
  default?: unknown;
  /** Nested object fields. */
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  /** zod-to-json-schema writes nullable non-primitive fields as `anyOf: [<type>, { type: "null" }]`. */
  anyOf?: JsonSchemaProperty[];
}

export interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/** One tool with everything the Tools page's side panel shows — `GET /api/tools/:connectionId/:toolName`. */
export interface ToolDetail extends ToolSummary {
  inputSchema: JsonSchemaObject;
  /** False when the whole connection is disabled; the tool can't be run then even if it's enabled. */
  connectionEnabled: boolean;
  /** This tool's most recent calls on this connection, newest first (at most 20). */
  recentCalls: ToolCallLogEntry[];
}

export interface PromptArgumentSummary {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptSummary {
  connectionId: string;
  connectionName: string;
  name: string;
  description: string;
  enabled: boolean;
  arguments?: PromptArgumentSummary[];
}

export interface McpTokenSummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface OAuthClientSummary {
  id: string;
  clientName: string;
  redirectUris: string[];
  registrationSource: "dcr" | "manual";
  createdAt: string;
  revokedAt: string | null;
}

export type ToolCallStatus = "success" | "error";

export interface ToolCallLogEntry {
  id: string;
  connectionId: string | null;
  toolName: string;
  status: ToolCallStatus;
  durationMs: number;
  errorSummary: string | null;
  createdAt: string;
}

export interface PromptCallLogEntry {
  id: string;
  connectionId: string | null;
  promptName: string;
  status: ToolCallStatus;
  durationMs: number;
  errorSummary: string | null;
  createdAt: string;
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
