import type { PromptArgumentSummary } from "@geektastic/shared";

/**
 * MCP prompt arguments are always strings. Blank optional arguments are left
 * out (so the prompt uses its own default wording), and blank required ones
 * are reported instead of sent.
 */
export function buildPromptArgs(
  args: PromptArgumentSummary[],
  values: Record<string, string>,
): { args: Record<string, string>; errors: Record<string, string> } {
  const out: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const arg of args) {
    const value = values[arg.name] ?? "";
    if (value.trim() === "") {
      if (arg.required) errors[arg.name] = "Required";
      continue;
    }
    out[arg.name] = value;
  }
  return { args: out, errors };
}

/** The JSON-RPC request an MCP client would send for this prompt. */
export function mcpPromptJson(promptName: string, args: Record<string, string>): string {
  return JSON.stringify(
    { jsonrpc: "2.0", id: 1, method: "prompts/get", params: { name: promptName, arguments: args } },
    null,
    2,
  );
}

/** Pasted documents get a tall box; other multi-line arguments a short one. */
export function textareaRows(arg: PromptArgumentSummary): number {
  return /(_document|_notes)$/.test(arg.name) ? 10 : 3;
}
