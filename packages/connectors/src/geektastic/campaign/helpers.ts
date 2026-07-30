import type { PromptMessage } from "../../types.js";

/**
 * Shared helpers for the Campaign Builder prompts (see ./index.ts). Small,
 * local re-implementations of the same-shaped private helpers in
 * ../prompts.ts — not imported from there since that file doesn't export
 * them, and duplicating ~10 lines here is simpler than reworking its exports
 * for a handful of callers with a different flavor (no `cfg`/API calls).
 */

export function requireArg(args: Record<string, string>, name: string): string {
  const value = args[name];
  if (!value) throw new Error(`Missing required argument "${name}"`);
  return value;
}

/** Blank/whitespace-only counts as "not provided" — matches the source skill's own optional-field handling. */
export function optionalArg(args: Record<string, string>, name: string): string | undefined {
  const value = args[name]?.trim();
  return value ? value : undefined;
}

export function userMessage(text: string): PromptMessage[] {
  return [{ role: "user", text }];
}

/**
 * Renders the provided (non-blank) fields as a "# User-Supplied Inputs" block.
 * `fields` is ordered — pass them in the same order as the mode's own "Step 1:
 * Gather Inputs" table so the block reads naturally.
 */
export function renderInputs(fields: Array<{ label: string; value: string | undefined }>): string {
  const lines = fields
    .filter((f) => f.value !== undefined)
    .map((f) => `- **${f.label}:** ${f.value}`);
  return ["# User-Supplied Inputs", "", ...lines].join("\n");
}
