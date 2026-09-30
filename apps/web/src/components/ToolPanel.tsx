import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { JsonSchemaProperty, ToolDetail, ToolSummary } from "@geektastic/shared";
import { api } from "../api/client";
import { ToolRunner } from "./ToolRunner";

const accessLabel: Record<ToolSummary["access"], { text: string; className: string }> = {
  read: { text: "Reads data", className: "border-emerald-700 bg-emerald-950 text-emerald-300" },
  write: { text: "Changes data", className: "border-indigo-700 bg-indigo-950 text-indigo-300" },
  delete: { text: "Deletes data", className: "border-red-800 bg-red-950 text-red-300" },
};

function typeLabel(spec: JsonSchemaProperty): string {
  const type = Array.isArray(spec.type) ? spec.type.join(" | ") : (spec.type ?? "any");
  return type === "array" && spec.items?.type ? `${spec.items.type}[]` : type;
}

/**
 * Docked panel on a connection's Tools tab for one tool: on/off switch, description,
 * inputs, a Try it form and recent calls. `tool` comes from ToolsGrid
 * (so its enabled state updates optimistically); the schema and calls are
 * fetched per tool.
 */
export function ToolPanel({
  tool,
  busy,
  onToggle,
  onClose,
}: {
  tool: ToolSummary;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["tool", tool.connectionId, tool.name];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      api
        .get<{ tool: ToolDetail }>(
          `/api/tools/${encodeURIComponent(tool.connectionId)}/${encodeURIComponent(tool.name)}`,
        )
        .then((res) => res.tool),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const access = accessLabel[tool.access];
  const properties = Object.entries(data?.inputSchema.properties ?? {});
  const required = new Set(data?.inputSchema.required ?? []);

  return (
    <aside
      aria-label={`${tool.name} details`}
      className="fixed inset-y-0 right-0 z-20 flex w-full flex-col border-l border-slate-800 bg-slate-950 shadow-2xl sm:w-[28rem]"
    >
      <header className="flex items-start gap-3 border-b border-slate-800 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">
            {tool.connectionName} · {tool.category}
          </p>
          <h2 className="mt-0.5 break-all font-mono text-sm text-white">{tool.name}</h2>
          <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-xs ${access.className}`}>
            {access.text}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-md px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          ×
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-slate-800 bg-slate-900 px-4 py-3">
          <span>
            <span className="block text-sm font-medium text-white">{tool.enabled ? "Enabled" : "Disabled"}</span>
            <span className="block text-xs text-slate-400">
              {tool.enabled ? "MCP clients can call this tool." : "Hidden from MCP clients and the playground."}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={tool.enabled}
            disabled={busy}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-5 w-5 cursor-pointer accent-indigo-500"
          />
        </label>

        {data && !data.connectionEnabled && (
          <p className="rounded-md border border-amber-800 bg-amber-950 px-3 py-2 text-xs text-amber-300">
            The {tool.connectionName} connection is disabled, so none of its tools reach MCP clients right now.
          </p>
        )}

        <section>
          <h3 className="mb-2 text-sm font-medium text-white">Description</h3>
          <p className="whitespace-pre-line text-sm text-slate-400">{tool.description}</p>
        </section>

        {isLoading && <p className="text-sm text-slate-400">Loading...</p>}
        {error && <p className="text-sm text-red-400">Couldn't load this tool's details.</p>}

        {data && (
          <>
            <section>
              <h3 className="mb-2 text-sm font-medium text-white">Inputs</h3>
              {properties.length === 0 ? (
                <p className="text-sm text-slate-500">This tool takes no inputs.</p>
              ) : (
                <dl className="divide-y divide-slate-800 rounded-md border border-slate-800">
                  {properties.map(([field, spec]) => (
                    <div key={field} className="px-3 py-2">
                      <dt className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <code className="text-slate-200">{field}</code>
                        <span className="text-xs text-slate-500">{typeLabel(spec)}</span>
                        {required.has(field) && <span className="text-xs text-red-400">required</span>}
                      </dt>
                      {spec.description && <dd className="mt-0.5 text-xs text-slate-400">{spec.description}</dd>}
                      {spec.enum && (
                        <dd className="mt-0.5 text-xs text-slate-500">One of: {spec.enum.map(String).join(", ")}</dd>
                      )}
                    </div>
                  ))}
                </dl>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-medium text-white">Try it</h3>
              {!tool.enabled || !data.connectionEnabled ? (
                <p className="text-sm text-slate-500">
                  {!tool.enabled && !data.connectionEnabled
                    ? `Turn this tool and the ${tool.connectionName} connection on to try it here.`
                    : !tool.enabled
                      ? "Turn this tool on to try it here."
                      : `Turn the ${tool.connectionName} connection on (on the Connections page) to try it here.`}
                </p>
              ) : (
                <>
                  {tool.access !== "read" && (
                    <p className="mb-3 rounded-md border border-amber-800 bg-amber-950 px-3 py-2 text-xs text-amber-300">
                      This runs against your real {tool.connectionName} data and will{" "}
                      {tool.access === "delete" ? "delete" : "change"} it.
                    </p>
                  )}
                  <ToolRunner
                    key={`${tool.connectionId}:${tool.name}`}
                    connectionId={tool.connectionId}
                    toolName={tool.name}
                    inputSchema={data.inputSchema}
                    onRan={() => void queryClient.invalidateQueries({ queryKey })}
                  />
                </>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-medium text-white">Recent calls</h3>
              {data.recentCalls.length === 0 ? (
                <p className="text-sm text-slate-500">No calls yet.</p>
              ) : (
                <ul className="divide-y divide-slate-800 rounded-md border border-slate-800 text-xs">
                  {data.recentCalls.map((call) => (
                    <li key={call.id} className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className={call.status === "success" ? "text-emerald-400" : "text-red-400"}>
                          {call.status}
                        </span>
                        <span className="text-slate-400">{call.durationMs} ms</span>
                        <span className="ml-auto text-slate-500">{new Date(call.createdAt).toLocaleString()}</span>
                      </div>
                      {call.errorSummary && (
                        <p className="mt-1 line-clamp-3 break-words text-red-300" title={call.errorSummary}>
                          {call.errorSummary}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
