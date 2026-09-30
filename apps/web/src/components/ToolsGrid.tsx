import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { ToolSummary } from "@geektastic/shared";
import { ToolPanel } from "./ToolPanel";

type Access = ToolSummary["access"];
type StatusFilter = "all" | "enabled" | "disabled";

const ACCESS_COLUMNS: Array<{ access: Access; label: string }> = [
  { access: "read", label: "Read" },
  { access: "write", label: "Create & edit" },
  { access: "delete", label: "Delete" },
];

const pillEnabled: Record<Access, string> = {
  read: "border-emerald-700 bg-emerald-950 text-emerald-300 hover:bg-emerald-900",
  write: "border-indigo-700 bg-indigo-950 text-indigo-300 hover:bg-indigo-900",
  delete: "border-red-800 bg-red-950 text-red-300 hover:bg-red-900",
};
const pillDisabled = "border-slate-700 border-dashed bg-transparent text-slate-500 line-through hover:text-slate-300";

const segmentButton = "px-3 py-1.5 text-sm font-medium transition-colors";
const segmentActive = "bg-indigo-600 text-white";
const segmentInactive = "bg-slate-800 text-slate-300 hover:bg-slate-700";
const presetButton =
  "rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50";

interface ToolChange {
  toolName: string;
  enabled: boolean;
}

/**
 * One connection's tools as a category × access grid, with search, filters,
 * presets and the side panel. The open tool's name is kept in `?tool=` so it
 * can be linked to.
 */
export function ToolsGrid({ connectionId }: { connectionId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [searchParams, setSearchParams] = useSearchParams();
  const openName = searchParams.get("tool");

  const openTool = useCallback(
    (tool: ToolSummary) => setSearchParams({ tool: tool.name }, { replace: true }),
    [setSearchParams],
  );
  const closePanel = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams]);

  const queryKey = ["tools", connectionId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get<{ tools: ToolSummary[] }>(`/api/tools?connectionId=${encodeURIComponent(connectionId)}`),
  });

  const bulkMutation = useMutation({
    mutationFn: (changes: ToolChange[]) => api.post("/api/tools/bulk", { connectionId, changes }),
    // Optimistic, so pills flip immediately; the refetch in onSettled corrects any failure.
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey });
      const next = new Map(changes.map((c) => [c.toolName, c.enabled]));
      queryClient.setQueryData<{ tools: ToolSummary[] }>(queryKey, (old) =>
        old ? { tools: old.tools.map((t) => (next.has(t.name) ? { ...t, enabled: next.get(t.name)! } : t)) } : old,
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["tools"] }),
  });

  function apply(tools: ToolSummary[], enabled: (t: ToolSummary) => boolean) {
    const changes = tools.filter((t) => t.enabled !== enabled(t)).map((t) => ({ toolName: t.name, enabled: enabled(t) }));
    if (changes.length > 0) bulkMutation.mutate(changes);
  }

  const allTools = data?.tools ?? [];

  /** Category name → the tools in that row that pass the current filters. */
  const rows = useMemo<Array<[string, ToolSummary[]]>>(() => {
    const needle = search.trim().toLowerCase();
    const byCategory = new Map<string, ToolSummary[]>();
    for (const tool of allTools) {
      if (status !== "all" && (status === "enabled") !== tool.enabled) continue;
      if (
        needle &&
        !tool.name.replace(/_/g, " ").toLowerCase().includes(needle) &&
        !tool.category.toLowerCase().includes(needle)
      ) {
        continue;
      }
      const row = byCategory.get(tool.category) ?? [];
      row.push(tool);
      byCategory.set(tool.category, row);
    }
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [allTools, search, status]);

  if (isLoading) return <p className="text-slate-400">Loading...</p>;
  if (allTools.length === 0) return <p className="text-slate-400">This connection has no tools.</p>;

  const enabledCount = allTools.filter((t) => t.enabled).length;
  const filtering = search.trim() !== "" || status !== "all";
  const busy = bulkMutation.isPending;
  const openedTool = openName ? allTools.find((t) => t.name === openName) : undefined;

  return (
    <div className={`space-y-4 ${openedTool ? "xl:mr-[28rem]" : ""}`}>
      <p className="text-sm text-slate-400">
        {enabledCount} of {allTools.length} tools enabled. Click a tool to see its inputs and recent calls, try it, or
        turn it on or off.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tools, e.g. encounter or delete"
          aria-label="Search tools"
          className="w-full max-w-sm rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        <div className="flex overflow-hidden rounded-md">
          {(["all", "enabled", "disabled"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`${segmentButton} ${status === value ? segmentActive : segmentInactive} capitalize`}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <button
            type="button"
            disabled={busy}
            className={presetButton}
            title="Turn on every tool in this connection"
            onClick={() => apply(allTools, () => true)}
          >
            Enable all
          </button>
          <button
            type="button"
            disabled={busy}
            className={presetButton}
            title="Turn on only the tools that read data; turn off everything that creates, edits or deletes"
            onClick={() => apply(allTools, (t) => t.access === "read")}
          >
            Read-only
          </button>
          <button
            type="button"
            disabled={busy}
            className={presetButton}
            title="Turn off every tool in this connection"
            onClick={() => apply(allTools, () => false)}
          >
            Disable all
          </button>
        </div>
      </div>

      <Legend />

      {rows.length === 0 ? (
        <p className="rounded-md border border-slate-800 px-4 py-3 text-sm text-slate-500">
          No tools match the current filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="w-10 px-4 py-2" />
                <th className="w-48 px-4 py-2">Category</th>
                {ACCESS_COLUMNS.map((col) => (
                  <th key={col.access} className="px-4 py-2">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([category, tools]) => (
                <tr key={category} className="border-t border-slate-800 align-top">
                  <td className="px-4 py-2.5">
                    <RowSwitch
                      tools={tools}
                      disabled={busy}
                      label={filtering ? `${category} (shown tools only)` : category}
                      onChange={(enabled) => apply(tools, () => enabled)}
                    />
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-200">{category}</td>
                  {ACCESS_COLUMNS.map((col) => (
                    <td key={col.access} className="px-4 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {tools
                          .filter((t) => t.access === col.access)
                          .map((tool) => (
                            <button
                              key={tool.name}
                              type="button"
                              aria-label={`${tool.name} (${tool.enabled ? "enabled" : "disabled"})`}
                              aria-current={openName === tool.name ? "true" : undefined}
                              title={`${tool.name} — ${tool.enabled ? "enabled" : "disabled"}`}
                              onClick={() => openTool(tool)}
                              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                                tool.enabled ? pillEnabled[tool.access] : pillDisabled
                              } ${openName === tool.name ? "ring-2 ring-white/70 ring-offset-1 ring-offset-slate-950" : ""}`}
                            >
                              {tool.action}
                            </button>
                          ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openedTool && (
        <ToolPanel
          tool={openedTool}
          busy={busy}
          onToggle={(enabled) => apply([openedTool], () => enabled)}
          onClose={closePanel}
        />
      )}
    </div>
  );
}

/** Checked when every tool in the row is on, indeterminate when some are. */
function RowSwitch({
  tools,
  disabled,
  label,
  onChange,
}: {
  tools: ToolSummary[];
  disabled: boolean;
  label: string;
  onChange: (enabled: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const on = tools.filter((t) => t.enabled).length;
  const allOn = on === tools.length;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = on > 0 && !allOn;
  }, [on, allOn]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allOn}
      disabled={disabled}
      aria-label={`Toggle all ${label} tools`}
      title={allOn ? "Turn off every tool in this row" : "Turn on every tool in this row"}
      onChange={() => onChange(!allOn)}
      className="h-4 w-4 cursor-pointer accent-indigo-500"
    />
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
      <span className={`rounded-full border px-2 py-0.5 ${pillEnabled.read}`}>reads</span>
      <span className={`rounded-full border px-2 py-0.5 ${pillEnabled.write}`}>changes</span>
      <span className={`rounded-full border px-2 py-0.5 ${pillEnabled.delete}`}>deletes</span>
      <span className={`rounded-full border px-2 py-0.5 ${pillDisabled}`}>off</span>
    </div>
  );
}
