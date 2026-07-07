import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { ToolCallLogEntry } from "@geektastic/shared";

export function Logs() {
  const [status, setStatus] = useState<"" | "success" | "error">("");
  const [toolName, setToolName] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["logs", status, toolName],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (toolName) params.set("toolName", toolName);
      return api.get<{ logs: ToolCallLogEntry[] }>(`/api/logs?${params.toString()}`);
    },
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Tool call logs</h1>

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
          value={toolName}
          onChange={(e) => setToolName(e.target.value)}
          placeholder="Filter by tool name"
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
                <th className="px-4 py-2">Tool</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">Error</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {data?.logs.map((log) => (
                <tr key={log.id} className="border-t border-slate-800 align-top">
                  <td className="px-4 py-2 font-mono text-xs text-slate-200">{log.toolName}</td>
                  <td className={`px-4 py-2 ${log.status === "success" ? "text-emerald-400" : "text-red-400"}`}>
                    {log.status}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{log.durationMs}ms</td>
                  <td className="max-w-xs px-4 py-2 text-xs text-red-300">{log.errorSummary ?? ""}</td>
                  <td className="px-4 py-2 text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {data?.logs.length === 0 && (
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
