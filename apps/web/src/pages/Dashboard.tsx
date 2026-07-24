import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

interface ConnectionHealth {
  id: string;
  name: string;
  enabled: boolean;
  ok: boolean;
  detail?: string;
}

interface RecentLog {
  id: string;
  toolName: string;
  status: "success" | "error";
  durationMs: number;
  createdAt: string;
}

interface DashboardSummary {
  connections: ConnectionHealth[];
  activeTokenCount: number;
  promptCallCount: number;
  recentErrorRate: number;
  recentLogs: RecentLog[];
}

export function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => api.get<DashboardSummary>("/api/dashboard/summary"),
    refetchInterval: 15000,
  });

  if (isLoading) return <p className="text-slate-400">Loading...</p>;
  if (error) return <p className="text-red-400">Failed to load dashboard.</p>;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">Dashboard</h1>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Connections" value={data.connections.length} />
        <StatCard label="Active MCP tokens" value={data.activeTokenCount} />
        <StatCard label="Prompt calls" value={data.promptCallCount} />
        <StatCard label="Recent error rate" value={`${Math.round(data.recentErrorRate * 100)}%`} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium text-white">Connection health</h2>
        <div className="space-y-2">
          {data.connections.length === 0 && <p className="text-slate-400">No connections configured yet.</p>}
          {data.connections.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900 px-4 py-3"
            >
              <span className="text-slate-200">{c.name}</span>
              <span className={c.ok ? "text-emerald-400" : "text-red-400"}>
                {c.ok ? "Healthy" : c.detail ?? "Unavailable"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-white">Recent tool calls</h2>
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-2">Tool</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {data.recentLogs.map((log) => (
                <tr key={log.id} className="border-t border-slate-800">
                  <td className="px-4 py-2 text-slate-200">{log.toolName}</td>
                  <td className={`px-4 py-2 ${log.status === "success" ? "text-emerald-400" : "text-red-400"}`}>
                    {log.status}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{log.durationMs}ms</td>
                  <td className="px-4 py-2 text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {data.recentLogs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-slate-500">
                    No tool calls yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}
