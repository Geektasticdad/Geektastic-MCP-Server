import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { JsonSchemaObject } from "@geektastic/shared";
import { api, ApiError } from "../api/client";

interface InvokeResponse {
  result: { content: Array<{ type: string; text: string }>; isError?: boolean };
}

/**
 * Input form + Run button + result for one tool, via POST /api/playground/invoke —
 * the same handler path MCP clients hit, so the call is logged like theirs.
 * Shared by the Testing Playground and the tool side panel. Give it a
 * `key` per tool so the form resets when the tool changes.
 */
export function ToolRunner({
  connectionId,
  toolName,
  inputSchema,
  onRan,
}: {
  connectionId: string;
  toolName: string;
  inputSchema: JsonSchemaObject;
  onRan?: () => void;
}) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const idPrefix = useId();

  const invokeMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api.post<InvokeResponse>("/api/playground/invoke", { connectionId, toolName, input }),
    onSettled: () => onRan?.(),
  });

  function onRun() {
    const properties = inputSchema.properties ?? {};
    const input: Record<string, unknown> = {};
    for (const [field, spec] of Object.entries(properties)) {
      const raw = fieldValues[field] ?? "";
      if (spec.type === "object" || spec.type === "array") {
        try {
          input[field] = raw ? JSON.parse(raw) : undefined;
        } catch {
          alert(`Field "${field}" must be valid JSON`);
          return;
        }
      } else if (spec.type === "number" || spec.type === "integer") {
        input[field] = raw === "" ? undefined : Number(raw);
      } else if (spec.type === "boolean") {
        input[field] = raw === "true";
      } else {
        input[field] = raw;
      }
    }
    invokeMutation.mutate(input);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {Object.entries(inputSchema.properties ?? {}).map(([field, spec]) => (
          <div key={field}>
            <label htmlFor={`${idPrefix}-${field}`} className="mb-1 block text-sm text-slate-300">
              {field}
              {inputSchema.required?.includes(field) && <span className="text-red-400"> *</span>}
            </label>
            {spec.type === "object" || spec.type === "array" ? (
              <textarea
                id={`${idPrefix}-${field}`}
                rows={4}
                value={fieldValues[field] ?? ""}
                onChange={(e) => setFieldValues((v) => ({ ...v, [field]: e.target.value }))}
                placeholder="JSON"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
              />
            ) : (
              <input
                id={`${idPrefix}-${field}`}
                value={fieldValues[field] ?? ""}
                onChange={(e) => setFieldValues((v) => ({ ...v, [field]: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            )}
            {spec.description && <p className="mt-1 text-xs text-slate-500">{spec.description}</p>}
          </div>
        ))}
        <button
          onClick={onRun}
          disabled={invokeMutation.isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {invokeMutation.isPending ? "Running..." : "Run tool"}
        </button>
      </div>

      {invokeMutation.isError && (
        <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
          {invokeMutation.error instanceof ApiError ? invokeMutation.error.message : "Tool call failed"}
        </div>
      )}

      {invokeMutation.data && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-white">Result</h3>
          <pre
            className={`max-h-96 overflow-auto rounded-md border p-4 text-xs ${
              invokeMutation.data.result.isError
                ? "border-red-900 bg-red-950 text-red-300"
                : "border-slate-800 bg-slate-900 text-slate-200"
            }`}
          >
            {invokeMutation.data.result.content.map((c) => c.text).join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}
