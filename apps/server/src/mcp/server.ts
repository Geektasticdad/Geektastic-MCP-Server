import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import { loadActiveConnections } from "../connections/service.js";
import { aggregatePrompts, aggregateTools, type PromptArgumentDefinition } from "@geektastic/connectors";
import { logToolCall } from "../logging/toolCallLog.js";
import { logPromptCall } from "../logging/promptCallLog.js";

function toRawShape(schema: z.ZodType): ZodRawShape {
  if (schema instanceof z.ZodObject) {
    return schema.shape as ZodRawShape;
  }
  // Tools are expected to declare z.object({...}) input schemas; fall back to
  // an empty shape (no args) if a connector ever provides something else.
  return {};
}

/**
 * MCP prompt arguments are always plain strings on the wire (unlike a tool's
 * arbitrary-JSON input) — this only needs to encode name/description/required,
 * not real coercion. Handlers parse/coerce further internally as needed.
 */
function toPromptArgsShape(args?: PromptArgumentDefinition[]): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const arg of args ?? []) {
    const base = arg.description ? z.string().describe(arg.description) : z.string();
    shape[arg.name] = arg.required ? base : base.optional();
  }
  return shape;
}

/**
 * Drops undefined-valued optional args so handlers always see Record<string, string>.
 * Takes `unknown` (like tools' handler args) rather than a precise object type,
 * since the SDK's inferred callback parameter type isn't something this code can
 * reliably match structurally — it's re-validated defensively here instead.
 */
function cleanPromptArgs(args: unknown): Record<string, string> {
  const clean: Record<string, string> = {};
  if (!args || typeof args !== "object") return clean;
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (typeof value === "string") clean[key] = value;
  }
  return clean;
}

export interface McpAuthContext {
  mcpTokenId?: string;
  oauthAccessTokenId?: string;
}

/**
 * Builds a fresh McpServer with tools drawn from currently enabled connections.
 * Called once per incoming MCP HTTP request (stateless transport, see mcp/http.ts)
 * so that toggling a tool or connection in the Web UI takes effect immediately.
 */
export async function buildMcpServer(auth: McpAuthContext): Promise<McpServer> {
  const server = new McpServer({ name: "geektastic-mcp-server", version: "1.4.0" });

  const connections = await loadActiveConnections();
  for (const tool of aggregateTools(connections)) {
    const { connectionId, definition } = tool;
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: toRawShape(definition.inputSchema),
      },
      async (args: unknown) => {
        const started = Date.now();
        try {
          const connectionConfig = connections.find((c) => c.connectionId === connectionId)!.config;
          const result = await definition.handler(args, connectionConfig);
          await logToolCall({
            mcpTokenId: auth.mcpTokenId,
            oauthAccessTokenId: auth.oauthAccessTokenId,
            connectionId,
            toolName: definition.name,
            status: result.isError ? "error" : "success",
            durationMs: Date.now() - started,
            errorSummary: result.isError ? result.content.map((c) => c.text).join("\n") : null,
          });
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await logToolCall({
            mcpTokenId: auth.mcpTokenId,
            oauthAccessTokenId: auth.oauthAccessTokenId,
            connectionId,
            toolName: definition.name,
            status: "error",
            durationMs: Date.now() - started,
            errorSummary: message,
          });
          return { content: [{ type: "text" as const, text: message }], isError: true };
        }
      },
    );
  }

  for (const prompt of aggregatePrompts(connections)) {
    const { connectionId, definition } = prompt;
    server.registerPrompt(
      definition.name,
      {
        description: definition.description,
        argsSchema: toPromptArgsShape(definition.arguments),
      },
      async (rawArgs: unknown) => {
        const started = Date.now();
        try {
          const connectionConfig = connections.find((c) => c.connectionId === connectionId)!.config;
          const result = await definition.handler(cleanPromptArgs(rawArgs), connectionConfig);
          await logPromptCall({
            mcpTokenId: auth.mcpTokenId,
            oauthAccessTokenId: auth.oauthAccessTokenId,
            connectionId,
            promptName: definition.name,
            status: "success",
            durationMs: Date.now() - started,
          });
          return {
            description: result.description,
            messages: result.messages.map((m) => ({
              role: m.role,
              content: { type: "text" as const, text: m.text },
            })),
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await logPromptCall({
            mcpTokenId: auth.mcpTokenId,
            oauthAccessTokenId: auth.oauthAccessTokenId,
            connectionId,
            promptName: definition.name,
            status: "error",
            durationMs: Date.now() - started,
            errorSummary: message,
          });
          // Unlike ToolResult, GetPromptResult has no isError convention — let
          // the SDK turn this into a proper JSON-RPC error response.
          throw err;
        }
      },
    );
  }

  return server;
}
