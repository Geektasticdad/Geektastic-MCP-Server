import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { PromptCallLogEntry, ToolCallLogEntry } from "@geektastic/shared";

const segmentButton = "rounded-md px-4 py-1.5 text-sm font-medium transition-colors";
const segmentActive = "bg-indigo-600 text-white";
const segmentInactive = "bg-slate-800 text-slate-300 hover:bg-slate-700";

interface NormalizedLogRow {
  id: string;
  name: string;
  status: "success" | "error";
  durationMs: number;
  errorSummary: string | null;
  createdAt: string;
}

export function Logs() {
  const [kind, setKind] = useState<"tool" | "prompt">("tool");
  const [status, setStatus] = useState<"" | "success" | "error">("");
  const [nameFilter, setNameFilter] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["logs", kind, status, nameFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (kind === "tool") {
        if (nameFilter) params.set("toolName", nameFilter);
        return api.get<{ logs: ToolCallLogEntry[] }>(`/api/logs?${params.toString()}`).then((res) => res.logs);
      }
      if (nameFilter) params.set("promptName", nameFilter);
      return api.get<{ logs: PromptCallLogEntry[] }>(`/api/prompt-logs?${params.toString()}`).then((res) => res.logs);
    },
    refetchInterval: 10000,
  });

  const rows: NormalizedLogRow[] = (data ?? []).map((log) => ({
    id: log.id,
    name: "toolName" in log ? log.toolName : log.promptName,
    status: log.status,
    durationMs: log.durationMs,
    errorSummary: log.errorSummary,
    createdAt: log.createdAt,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">{kind === "tool" ? "Tool call logs" : "Prompt call logs"}</h1>

      <div className="flex gap-2">
        <button
          type="button"
          className={`${segmentButton} ${kind === "tool" ? segmentActive : segmentInactive}`}
          onClick={() => {
            setKind("tool");
            setNameFilter("");
          }}
        >
          Tool Calls
        </button>
        <button
          type="button"
          className={`${segmentButton} ${kind === "prompt" ? segmentActive : segmentInactive}`}
          onClick={() => {
            setKind("prompt");
            setNameFilter("");
          }}
        >
          Prompt Calls
        </button>
      </div>

      <div className="flex gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>
        <input
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          placeholder={kind === "tool" ? "Filter by tool name" : "Filter by prompt name"}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
      </div>

      {error && (
        <div className="max-w-2xl rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
          {error instanceof ApiError ? error.message : "Failed to load logs"}
        </div>
      )}

      {isLoading ? (
        <p className="text-slate-400">Loading...</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-2">{kind === "tool" ? "Tool" : "Prompt"}</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">Error</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => (
                <tr key={log.id} className="border-t border-slate-800 align-top">
                  <td className="px-4 py-2 font-mono text-xs text-slate-200">{log.name}</td>
                  <td className={`px-4 py-2 ${log.status === "success" ? "text-emerald-400" : "text-red-400"}`}>
                    {log.status}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{log.durationMs}ms</td>
                  <td className="max-w-xs px-4 py-2 text-xs text-red-300">{log.errorSummary ?? ""}</td>
                  <td className="px-4 py-2 text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-slate-500">
                    No log entries match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
