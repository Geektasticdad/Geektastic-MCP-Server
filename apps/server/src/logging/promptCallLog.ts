import { prisma } from "../db.js";

interface LogPromptCallInput {
  mcpTokenId?: string | null;
  oauthAccessTokenId?: string | null;
  connectionId: string | null;
  promptName: string;
  status: "success" | "error";
  durationMs: number;
  errorSummary?: string | null;
}

export async function logPromptCall(input: LogPromptCallInput): Promise<void> {
  await prisma.promptCallLog.create({
    data: {
      tokenId: input.mcpTokenId ?? null,
      oauthAccessTokenId: input.oauthAccessTokenId ?? null,
      connectionId: input.connectionId,
      promptName: input.promptName,
      status: input.status,
      durationMs: input.durationMs,
      errorSummary: input.errorSummary?.slice(0, 1000) ?? null,
    },
  });
}
