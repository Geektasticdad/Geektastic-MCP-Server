import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { PromptArgumentSummary } from "@geektastic/shared";
import { api, ApiError } from "../api/client";
import { buildPromptArgs, mcpPromptJson, textareaRows } from "../promptForm";
import { CopyButton } from "./CopyButton";

interface RenderResponse {
  result: { description?: string; messages: Array<{ role: "user" | "assistant"; text: string }> };
}

const fieldClass = "w-full rounded-md border bg-slate-950 px-3 py-2 text-sm text-white";

/**
 * Argument form + Preview button + the rendered messages for one prompt, via
 * POST /api/playground/prompts/render — the same handler MCP clients hit, so
 * it's logged like theirs. Shared by the Testing Playground and the prompt
 * side panel. Give it a `key` per prompt so the form resets when it changes.
 */
export function PromptRunner({
  connectionId,
  promptName,
  args,
  onRan,
}: {
  connectionId: string;
  promptName: string;
  args: PromptArgumentSummary[];
  onRan?: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showRequest, setShowRequest] = useState(false);
  const idPrefix = useId();

  const renderMutation = useMutation({
    mutationFn: (built: Record<string, string>) =>
      api.post<RenderResponse>("/api/playground/prompts/render", { connectionId, promptName, args: built }),
    onSettled: () => onRan?.(),
  });

  const setValue = (name: string, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => {
      const rest = { ...e };
      delete rest[name];
      return rest;
    });
  };

  function onPreview() {
    const built = buildPromptArgs(args, values);
    setErrors(built.errors);
    if (Object.keys(built.errors).length === 0) renderMutation.mutate(built.args);
  }

  const request = mcpPromptJson(promptName, buildPromptArgs(args, values).args);
  const messages = renderMutation.data?.result.messages ?? [];
  const allText = messages.map((m) => m.text).join("\n\n");

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {args.length === 0 && <p className="text-sm text-slate-500">This prompt takes no arguments.</p>}
        {args.map((arg) => {
          const id = `${idPrefix}-${arg.name}`;
          const error = errors[arg.name];
          const border = error ? "border-red-600" : "border-slate-700";
          const value = values[arg.name] ?? "";
          return (
            <div key={arg.name}>
              <label htmlFor={id} className="mb-1 flex flex-wrap items-baseline gap-x-2 text-sm text-slate-300">
                <span>{arg.name}</span>
                {arg.required ? <span className="text-red-400">*</span> : <span className="text-xs text-slate-500">optional</span>}
              </label>
              {arg.multiline ? (
                <textarea
                  id={id}
                  rows={textareaRows(arg)}
                  value={value}
                  onChange={(e) => setValue(arg.name, e.target.value)}
                  aria-describedby={`${id}-help`}
                  aria-invalid={!!error}
                  className={`${fieldClass} ${border} resize-y`}
                />
              ) : (
                <input
                  id={id}
                  value={value}
                  onChange={(e) => setValue(arg.name, e.target.value)}
                  aria-describedby={`${id}-help`}
                  aria-invalid={!!error}
                  className={`${fieldClass} ${border}`}
                />
              )}
              {arg.suggestions && (
                <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={`Suggestions for ${arg.name}`}>
                  {arg.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={value === s}
                      onClick={() => setValue(arg.name, value === s ? "" : s)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        value === s
                          ? "border-indigo-500 bg-indigo-600 text-white"
                          : "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div id={`${id}-help`}>
                {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
                {arg.description && <p className="mt-1 text-xs text-slate-500">{arg.description}</p>}
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onPreview}
            disabled={renderMutation.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {renderMutation.isPending ? "Building..." : "Preview prompt"}
          </button>
          <button
            type="button"
            onClick={() => setShowRequest((s) => !s)}
            aria-expanded={showRequest}
            className="rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            {showRequest ? "Hide MCP request" : "Show MCP request"}
          </button>
        </div>
        {Object.keys(errors).length > 0 && (
          <p className="text-sm text-red-400">Fill in the highlighted fields to preview this prompt.</p>
        )}
      </div>

      {showRequest && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-medium text-white">MCP request</h3>
            <CopyButton text={request} label="Copy request" />
          </div>
          <p className="mb-2 text-xs text-slate-500">
            The <code>prompts/get</code> an MCP client would send with these arguments.
          </p>
          <pre className="max-h-64 overflow-auto rounded-md border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">
            {request}
          </pre>
        </div>
      )}

      {renderMutation.isError && (
        <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
          {renderMutation.error instanceof ApiError ? renderMutation.error.message : "Couldn't build this prompt."}
        </div>
      )}

      {renderMutation.data && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-white">
              {messages.length === 1 ? "1 message" : `${messages.length} messages`}
            </h3>
            {messages.length > 1 && <CopyButton text={allText} label="Copy all" />}
          </div>
          {renderMutation.data.result.description && (
            <p className="text-xs text-slate-400">{renderMutation.data.result.description}</p>
          )}
          {messages.map((message, i) => (
            <div key={i} className="rounded-md border border-slate-800 bg-slate-900">
              <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                    message.role === "user" ? "bg-indigo-950 text-indigo-300" : "bg-emerald-950 text-emerald-300"
                  }`}
                >
                  {message.role}
                </span>
                <span className="text-xs text-slate-500">{message.text.length.toLocaleString()} characters</span>
                <span className="ml-auto">
                  <CopyButton text={message.text} label="Copy" />
                </span>
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words p-3 text-xs text-slate-200">
                {message.text}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
