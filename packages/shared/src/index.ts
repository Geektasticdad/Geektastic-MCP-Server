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
  enabled: boolean;
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

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
