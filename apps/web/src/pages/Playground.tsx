import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";

interface JsonSchemaProperty {
  type?: string;
  description?: string;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface PlaygroundTool {
  connectionId: string;
  connectionName: string;
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

interface PlaygroundPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

interface PlaygroundPrompt {
  connectionId: string;
  connectionName: string;
  name: string;
  description: string;
  arguments?: PlaygroundPromptArgument[];
}

interface PlaygroundPromptResult {
  description?: string;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
}

const segmentButton = "rounded-md px-4 py-1.5 text-sm font-medium transition-colors";
const segmentActive = "bg-indigo-600 text-white";
const segmentInactive = "bg-slate-800 text-slate-300 hover:bg-slate-700";

export function Playground() {
  const [mode, setMode] = useState<"tool" | "prompt">("tool");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Testing playground</h1>
      <p className="max-w-2xl text-sm text-slate-400">
        Invokes the same tool/prompt handler used by MCP clients over <code>/mcp</code>, so results and logs match
        exactly what a connected client would see.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          className={`${segmentButton} ${mode === "tool" ? segmentActive : segmentInactive}`}
          onClick={() => setMode("tool")}
        >
          Tools
        </button>
        <button
          type="button"
          className={`${segmentButton} ${mode === "prompt" ? segmentActive : segmentInactive}`}
          onClick={() => setMode("prompt")}
        >
          Prompts
        </button>
      </div>

      {mode === "tool" ? <ToolPlayground /> : <PromptPlayground />}
    </div>
  );
}

function ToolPlayground() {
  const { data } = useQuery({
    queryKey: ["playground-tools"],
    queryFn: () => api.get<{ tools: PlaygroundTool[] }>("/api/playground/tools"),
  });

  const [selectedKey, setSelectedKey] = useState<string>("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const selected = useMemo(
    () => data?.tools.find((t) => `${t.connectionId}:${t.name}` === selectedKey),
    [data, selectedKey],
  );

  const invokeMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api.post<{ result: { content: Array<{ type: string; text: string }>; isError?: boolean } }>(
        "/api/playground/invoke",
        { connectionId: selected!.connectionId, toolName: selected!.name, input },
      ),
  });

  function onSelectTool(key: string) {
    setSelectedKey(key);
    setFieldValues({});
    invokeMutation.reset();
  }

  function onRun() {
    if (!selected) return;
    const properties = selected.inputSchema.properties ?? {};
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
    <div className="space-y-6">
      <div className="max-w-md">
        <label className="mb-1 block text-sm text-slate-300">Tool</label>
        <select
          value={selectedKey}
          onChange={(e) => onSelectTool(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">Select a tool...</option>
          {data?.tools.map((t) => (
            <option key={`${t.connectionId}:${t.name}`} value={`${t.connectionId}:${t.name}`}>
              {t.connectionName} / {t.name}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <div className="max-w-lg space-y-3 rounded-md border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">{selected.description}</p>
          {Object.entries(selected.inputSchema.properties ?? {}).map(([field, spec]) => (
            <div key={field}>
              <label className="mb-1 block text-sm text-slate-300">
                {field}
                {selected.inputSchema.required?.includes(field) && <span className="text-red-400"> *</span>}
              </label>
              {spec.type === "object" || spec.type === "array" ? (
                <textarea
                  rows={4}
                  value={fieldValues[field] ?? ""}
                  onChange={(e) => setFieldValues((v) => ({ ...v, [field]: e.target.value }))}
                  placeholder="JSON"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
                />
              ) : (
                <input
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
            Run tool
          </button>
        </div>
      )}

      {invokeMutation.isError && (
        <div className="max-w-2xl rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
          {invokeMutation.error instanceof ApiError ? invokeMutation.error.message : "Tool call failed"}
        </div>
      )}

      {invokeMutation.data && (
        <div className="max-w-2xl">
          <h2 className="mb-2 text-lg font-medium text-white">Result</h2>
          <pre
            className={`overflow-x-auto rounded-md border p-4 text-xs ${
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

function PromptPlayground() {
  const { data } = useQuery({
    queryKey: ["playground-prompts"],
    queryFn: () => api.get<{ prompts: PlaygroundPrompt[] }>("/api/playground/prompts"),
  });

  const [selectedKey, setSelectedKey] = useState<string>("");
  const [argValues, setArgValues] = useState<Record<string, string>>({});

  const selected = useMemo(
    () => data?.prompts.find((p) => `${p.connectionId}:${p.name}` === selectedKey),
    [data, selectedKey],
  );

  const renderMutation = useMutation({
    mutationFn: (args: Record<string, string>) =>
      api.post<{ result: PlaygroundPromptResult }>("/api/playground/prompts/render", {
        connectionId: selected!.connectionId,
        promptName: selected!.name,
        args,
      }),
  });

  function onSelectPrompt(key: string) {
    setSelectedKey(key);
    setArgValues({});
    renderMutation.reset();
  }

  function onRun() {
    if (!selected) return;
    const args: Record<string, string> = {};
    for (const arg of selected.arguments ?? []) {
      const raw = argValues[arg.name] ?? "";
      if (raw !== "") args[arg.name] = raw;
    }
    renderMutation.mutate(args);
  }

  return (
    <div className="space-y-6">
      <div className="max-w-md">
        <label className="mb-1 block text-sm text-slate-300">Prompt</label>
        <select
          value={selectedKey}
          onChange={(e) => onSelectPrompt(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">Select a prompt...</option>
          {data?.prompts.map((p) => (
            <option key={`${p.connectionId}:${p.name}`} value={`${p.connectionId}:${p.name}`}>
              {p.connectionName} / {p.name}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <div className="max-w-lg space-y-3 rounded-md border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">{selected.description}</p>
          {(selected.arguments ?? []).map((arg) => (
            <div key={arg.name}>
              <label className="mb-1 block text-sm text-slate-300">
                {arg.name}
                {arg.required && <span className="text-red-400"> *</span>}
              </label>
              <input
                value={argValues[arg.name] ?? ""}
                onChange={(e) => setArgValues((v) => ({ ...v, [arg.name]: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
              {arg.description && <p className="mt-1 text-xs text-slate-500">{arg.description}</p>}
            </div>
          ))}
          <button
            onClick={onRun}
            disabled={renderMutation.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Run prompt
          </button>
        </div>
      )}

      {renderMutation.isError && (
        <div className="max-w-2xl rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
          {renderMutation.error instanceof ApiError ? renderMutation.error.message : "Prompt call failed"}
        </div>
      )}

      {renderMutation.data && (
        <div className="max-w-2xl space-y-3">
          <h2 className="text-lg font-medium text-white">Result</h2>
          {renderMutation.data.result.description && (
            <p className="text-sm text-slate-400">{renderMutation.data.result.description}</p>
          )}
          {renderMutation.data.result.messages.map((message, i) => (
            <div key={i} className="rounded-md border border-slate-800 bg-slate-900 p-4">
              <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">{message.role}</div>
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-200">{message.text}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
