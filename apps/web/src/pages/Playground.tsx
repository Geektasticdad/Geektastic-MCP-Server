import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { JsonSchemaObject, PromptSummary } from "@geektastic/shared";
import { api } from "../api/client";
import { ToolRunner } from "../components/ToolRunner";
import { PromptRunner } from "../components/PromptRunner";

interface PlaygroundTool {
  connectionId: string;
  connectionName: string;
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
}

/** GET /api/playground/prompts rows — a PromptSummary without the enabled flag (they're all enabled). */
type PlaygroundPrompt = Omit<PromptSummary, "enabled">;

const segmentButton = "rounded-md px-4 py-1.5 text-sm font-medium transition-colors";
const segmentActive = "bg-indigo-600 text-white";
const segmentInactive = "bg-slate-800 text-slate-300 hover:bg-slate-700";

export function Playground() {
  // Mode and selection live in the URL (?tool=… / ?mode=prompts&prompt=…) so search results can link here.
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get("mode") === "prompts" || searchParams.has("prompt") ? "prompt" : "tool";
  const setMode = (next: "tool" | "prompt") =>
    setSearchParams(next === "prompt" ? { mode: "prompts" } : {}, { replace: true });

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

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedKey = searchParams.get("prompt") ?? "";
  const setSelectedKey = (key: string) =>
    setSearchParams(key ? { mode: "prompts", prompt: key } : { mode: "prompts" }, { replace: true });

  const selected = useMemo(
    () => data?.prompts.find((p) => `${p.connectionId}:${p.name}` === selectedKey),
    [data, selectedKey],
  );
  const groups = useMemo(() => {
    const byGroup = new Map<string, PlaygroundPrompt[]>();
    for (const prompt of data?.prompts ?? []) {
      const label = `${prompt.connectionName} · ${prompt.category}`;
      const list = byGroup.get(label) ?? [];
      list.push(prompt);
      byGroup.set(label, list);
    }
    return [...byGroup.entries()];
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="max-w-md">
        <label htmlFor="playground-prompt" className="mb-1 block text-sm text-slate-300">
          Prompt
        </label>
        <select
          id="playground-prompt"
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">Select a prompt...</option>
          {groups.map(([label, prompts]) => (
            <optgroup key={label} label={label}>
              {prompts.map((p) => (
                <option key={`${p.connectionId}:${p.name}`} value={`${p.connectionId}:${p.name}`}>
                  {p.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {data && data.prompts.length === 0 && (
          <p className="mt-1 text-xs text-slate-500">No prompts are enabled on any enabled connection.</p>
        )}
      </div>
      {selectedKey && data && !selected && (
        <p className="text-sm text-amber-300">
          That prompt isn't available here — it may be turned off, or its connection is disabled.
        </p>
      )}

      {selected && (
        <div className="max-w-3xl rounded-md border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-medium text-white">{selected.title}</h2>
          <p className="font-mono text-xs text-slate-500">{selected.name}</p>
          <p className="mb-2 mt-3 text-sm text-slate-400">{selected.description}</p>
          <p className="mb-4 text-xs text-slate-500">
            Previewing builds the messages an MCP client would receive. It may read from {selected.connectionName},
            but it never changes anything or sends anything to an AI model.
          </p>
          <PromptRunner
            key={selectedKey}
            connectionId={selected.connectionId}
            promptName={selected.name}
            args={selected.arguments ?? []}
          />
        </div>
      )}
    </div>
  );
}
