import { prisma } from "../db.js";

interface LogToolCallInput {
  mcpTokenId?: string | null;
  oauthAccessTokenId?: string | null;
  connectionId: string | null;
  toolName: string;
  status: "success" | "error";
  durationMs: number;
  errorSummary?: string | null;
}

export async function logToolCall(input: LogToolCallInput): Promise<void> {
  await prisma.toolCallLog.create({
    data: {
      tokenId: input.mcpTokenId ?? null,
      oauthAccessTokenId: input.oauthAccessTokenId ?? null,
      connectionId: input.connectionId,
      toolName: input.toolName,
      status: input.status,
      durationMs: input.durationMs,
      errorSummary: input.errorSummary?.slice(0, 1000) ?? null,
    },
  });
}
