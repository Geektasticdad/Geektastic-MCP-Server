import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { JsonSchemaObject } from "@geektastic/shared";
import { api, ApiError } from "../api/client";
import { ToolRunner } from "../components/ToolRunner";

interface PlaygroundTool {
  connectionId: string;
  connectionName: string;
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
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

  // The chosen tool, as "<connectionId>:<toolName>", kept in the URL so the search box can link here.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedKey = searchParams.get("tool") ?? "";
  const setSelectedKey = (key: string) => setSearchParams(key ? { tool: key } : {}, { replace: true });

  const selected = useMemo(
    () => data?.tools.find((t) => `${t.connectionId}:${t.name}` === selectedKey),
    [data, selectedKey],
  );
  const byConnection = useMemo(() => {
    const groups = new Map<string, PlaygroundTool[]>();
    for (const tool of data?.tools ?? []) {
      const list = groups.get(tool.connectionName) ?? [];
      list.push(tool);
      groups.set(tool.connectionName, list);
    }
    return [...groups.entries()];
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="max-w-md">
        <label htmlFor="playground-tool" className="mb-1 block text-sm text-slate-300">
          Tool
        </label>
        <select
          id="playground-tool"
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">Select a tool...</option>
          {byConnection.map(([connectionName, tools]) => (
            <optgroup key={connectionName} label={connectionName}>
              {tools.map((t) => (
                <option key={`${t.connectionId}:${t.name}`} value={`${t.connectionId}:${t.name}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Tip: press <kbd className="rounded bg-slate-800 px-1">Ctrl</kbd>+
          <kbd className="rounded bg-slate-800 px-1">K</kbd> to search every tool by name.
        </p>
      </div>
      {selectedKey && data && !selected && (
        <p className="text-sm text-amber-300">
          That tool isn't available here — it may be turned off, or its connection is disabled.
        </p>
      )}

      {selected && (
        <div className="max-w-2xl rounded-md border border-slate-800 bg-slate-900 p-5">
          <p className="mb-4 text-sm text-slate-400">{selected.description}</p>
          <ToolRunner
            key={selectedKey}
            connectionId={selected.connectionId}
            toolName={selected.name}
            inputSchema={selected.inputSchema}
          />
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
