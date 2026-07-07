import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import { loadActiveConnections } from "../connections/service.js";
import { aggregateTools } from "@geektastic/connectors";
import { logToolCall } from "../logging/toolCallLog.js";

function toRawShape(schema: z.ZodType): ZodRawShape {
  if (schema instanceof z.ZodObject) {
    return schema.shape as ZodRawShape;
  }
  // Tools are expected to declare z.object({...}) input schemas; fall back to
  // an empty shape (no args) if a connector ever provides something else.
  return {};
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
  const server = new McpServer({ name: "geektastic-mcp-server", version: "0.1.0" });

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

  return server;
}
