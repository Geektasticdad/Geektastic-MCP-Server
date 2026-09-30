import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { ToolSummary } from "@geektastic/shared";
import { ToolPanel } from "../components/ToolPanel";

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

interface ConnectionGroup {
  connectionId: string;
  connectionName: string;
  tools: ToolSummary[];
  /** Category name → the tools in that row that pass the current filters. */
  rows: Array<[string, ToolSummary[]]>;
}

export function Tools() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  // The open side panel's tool, as "<connectionId>:<toolName>", kept in the URL so it can be linked to.
  const [searchParams, setSearchParams] = useSearchParams();
  const openKey = searchParams.get("tool");

  const openTool = useCallback(
    (tool: ToolSummary) => setSearchParams({ tool: toolKey(tool) }, { replace: true }),
    [setSearchParams],
  );
  const closePanel = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ["tools"],
    queryFn: () => api.get<{ tools: ToolSummary[] }>("/api/tools"),
  });

  const bulkMutation = useMutation({
    mutationFn: (input: { connectionId: string; changes: ToolChange[] }) => api.post("/api/tools/bulk", input),
    // Optimistic, so pills flip immediately; the refetch in onSettled corrects any failure.
    onMutate: async ({ connectionId, changes }) => {
      await queryClient.cancelQueries({ queryKey: ["tools"] });
      const next = new Map(changes.map((c) => [c.toolName, c.enabled]));
      queryClient.setQueryData<{ tools: ToolSummary[] }>(["tools"], (old) =>
        old
          ? {
              tools: old.tools.map((t) =>
                t.connectionId === connectionId && next.has(t.name) ? { ...t, enabled: next.get(t.name)! } : t,
              ),
            }
          : old,
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["tools"] }),
  });

  function apply(connectionId: string, tools: ToolSummary[], enabled: (t: ToolSummary) => boolean) {
    const changes = tools.filter((t) => t.enabled !== enabled(t)).map((t) => ({ toolName: t.name, enabled: enabled(t) }));
    if (changes.length > 0) bulkMutation.mutate({ connectionId, changes });
  }

  const groups = useMemo<ConnectionGroup[]>(() => {
    const needle = search.trim().toLowerCase();
    const matches = (t: ToolSummary) =>
      (status === "all" || (status === "enabled") === t.enabled) &&
      (!needle ||
        t.name.replace(/_/g, " ").toLowerCase().includes(needle) ||
        t.category.toLowerCase().includes(needle));

    const byConnection = new Map<string, ConnectionGroup>();
    for (const tool of data?.tools ?? []) {
      let group = byConnection.get(tool.connectionId);
      if (!group) {
        group = { connectionId: tool.connectionId, connectionName: tool.connectionName, tools: [], rows: [] };
        byConnection.set(tool.connectionId, group);
      }
      group.tools.push(tool);
    }
    for (const group of byConnection.values()) {
      const rows = new Map<string, ToolSummary[]>();
      for (const tool of group.tools.filter(matches)) {
        const row = rows.get(tool.category) ?? [];
        row.push(tool);
        rows.set(tool.category, row);
      }
      group.rows = [...rows.entries()].sort(([a], [b]) => a.localeCompare(b));
    }
    return [...byConnection.values()];
  }, [data, search, status]);

  if (isLoading) return <p className="text-slate-400">Loading...</p>;

  const allTools = data?.tools ?? [];
  const enabledCount = allTools.filter((t) => t.enabled).length;
  const filtering = search.trim() !== "" || status !== "all";
  const openedTool = openKey ? allTools.find((t) => toolKey(t) === openKey) : undefined;

  return (
    <div className={`space-y-6 ${openedTool ? "lg:mr-[28rem]" : ""}`}>
      <div>
        <h1 className="text-2xl font-semibold text-white">Tools</h1>
        <p className="mt-1 text-sm text-slate-400">
          {enabledCount} of {allTools.length} tools enabled. Click a tool to see its inputs and recent calls, try
          it, or turn it on or off.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tools, e.g. encounter or delete"
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
        <Legend />
      </div>

      {groups
        .filter((group) => !filtering || group.rows.length > 0)
        .map((group) => (
          <ConnectionSection
            key={group.connectionId}
            group={group}
            filtering={filtering}
            busy={bulkMutation.isPending}
            openKey={openKey}
            onOpen={openTool}
            onApply={(tools, enabled) => apply(group.connectionId, tools, enabled)}
          />
        ))}

      {groups.length === 0 && <p className="text-slate-400">No tools available yet — add a connection first.</p>}
      {groups.length > 0 && filtering && groups.every((g) => g.rows.length === 0) && (
        <p className="text-slate-400">No tools match the current filters.</p>
      )}

      {openedTool && (
        <ToolPanel
          tool={openedTool}
          busy={bulkMutation.isPending}
          onToggle={(enabled) => apply(openedTool.connectionId, [openedTool], () => enabled)}
          onClose={closePanel}
        />
      )}
    </div>
  );
}

function toolKey(tool: ToolSummary): string {
  return `${tool.connectionId}:${tool.name}`;
}

function ConnectionSection({
  group,
  filtering,
  busy,
  openKey,
  onOpen,
  onApply,
}: {
  group: ConnectionGroup;
  filtering: boolean;
  busy: boolean;
  openKey: string | null;
  onOpen: (tool: ToolSummary) => void;
  onApply: (tools: ToolSummary[], enabled: (t: ToolSummary) => boolean) => void;
}) {
  const enabledCount = group.tools.filter((t) => t.enabled).length;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-lg font-medium text-white">{group.connectionName}</h2>
        <span className="text-sm text-slate-400">
          {enabledCount} / {group.tools.length} enabled
        </span>
        <div className="flex gap-2 sm:ml-auto">
          <button
            type="button"
            disabled={busy}
            className={presetButton}
            title="Turn on every tool in this connection"
            onClick={() => onApply(group.tools, () => true)}
          >
            Enable all
          </button>
          <button
            type="button"
            disabled={busy}
            className={presetButton}
            title="Turn on only the tools that read data; turn off everything that creates, edits or deletes"
            onClick={() => onApply(group.tools, (t) => t.access === "read")}
          >
            Read-only
          </button>
          <button
            type="button"
            disabled={busy}
            className={presetButton}
            title="Turn off every tool in this connection"
            onClick={() => onApply(group.tools, () => false)}
          >
            Disable all
          </button>
        </div>
      </div>

      {group.rows.length === 0 ? (
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
              {group.rows.map(([category, tools]) => (
                <tr key={category} className="border-t border-slate-800 align-top">
                  <td className="px-4 py-2.5">
                    <RowSwitch
                      tools={tools}
                      disabled={busy}
                      label={filtering ? `${category} (shown tools only)` : category}
                      onChange={(enabled) => onApply(tools, () => enabled)}
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
                              aria-current={openKey === toolKey(tool) ? "true" : undefined}
                              title={`${tool.name} — ${tool.enabled ? "enabled" : "disabled"}`}
                              onClick={() => onOpen(tool)}
                              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                                tool.enabled ? pillEnabled[tool.access] : pillDisabled
                              } ${openKey === toolKey(tool) ? "ring-2 ring-white/70 ring-offset-1 ring-offset-slate-950" : ""}`}
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
    </section>
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
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 sm:ml-auto">
      <span className={`rounded-full border px-2 py-0.5 ${pillEnabled.read}`}>reads</span>
      <span className={`rounded-full border px-2 py-0.5 ${pillEnabled.write}`}>changes</span>
      <span className={`rounded-full border px-2 py-0.5 ${pillEnabled.delete}`}>deletes</span>
      <span className={`rounded-full border px-2 py-0.5 ${pillDisabled}`}>off</span>
    </div>
  );
}
