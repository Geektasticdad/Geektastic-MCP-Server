import { Router } from "express";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { requireAuth, requireCsrf } from "../auth/middleware.js";
import { loadActiveConnections } from "../connections/service.js";
import { aggregateTools } from "@geektastic/connectors";
import { logToolCall } from "../logging/toolCallLog.js";

export const playgroundRouter = Router();
playgroundRouter.use(requireAuth);

// Tools available to the playground: only enabled tools on enabled connections.
// The testing playground reuses this same aggregation + handler path as the /mcp endpoint.
playgroundRouter.get("/tools", async (_req, res) => {
  const connections = await loadActiveConnections();
  const tools = aggregateTools(connections).map((t) => ({
    connectionId: t.connectionId,
    connectionName: t.connectionName,
    name: t.definition.name,
    description: t.definition.description,
    inputSchema: zodToJsonSchema(t.definition.inputSchema),
  }));
  res.json({ tools });
});

const invokeSchema = z.object({
  connectionId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.unknown(),
});

playgroundRouter.post("/invoke", requireCsrf, async (req, res) => {
  const parsed = invokeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { connectionId, toolName, input } = parsed.data;

  const connections = await loadActiveConnections();
  const match = aggregateTools(connections).find(
    (t) => t.connectionId === connectionId && t.definition.name === toolName,
  );
  if (!match) {
    res.status(404).json({ error: "Tool not found or not enabled" });
    return;
  }

  const started = Date.now();
  try {
    const result = await match.definition.handler(input, connections.find((c) => c.connectionId === connectionId)!.config);
    await logToolCall({
      mcpTokenId: null,
      connectionId,
      toolName,
      status: result.isError ? "error" : "success",
      durationMs: Date.now() - started,
      errorSummary: result.isError ? result.content.map((c) => c.text).join("\n") : null,
    });
    res.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logToolCall({
      mcpTokenId: null,
      connectionId,
      toolName,
      status: "error",
      durationMs: Date.now() - started,
      errorSummary: message,
    });
    res.status(500).json({ error: message });
  }
});
