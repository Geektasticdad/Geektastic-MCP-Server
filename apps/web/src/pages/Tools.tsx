import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ToolSummary } from "@geektastic/shared";

export function Tools() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["tools"],
    queryFn: () => api.get<{ tools: ToolSummary[] }>("/api/tools"),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { connectionId: string; toolName: string; enabled: boolean }) =>
      api.post("/api/tools/toggle", input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tools"] }),
  });

  if (isLoading) return <p className="text-slate-400">Loading...</p>;

  const grouped = new Map<string, ToolSummary[]>();
  for (const tool of data?.tools ?? []) {
    const list = grouped.get(tool.connectionName) ?? [];
    list.push(tool);
    grouped.set(tool.connectionName, list);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">Tools</h1>
      {[...grouped.entries()].map(([connectionName, tools]) => (
        <section key={connectionName}>
          <h2 className="mb-3 text-lg font-medium text-white">{connectionName}</h2>
          <div className="overflow-hidden rounded-md border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-4 py-2">Tool</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool) => (
                  <tr key={tool.name} className="border-t border-slate-800">
                    <td className="px-4 py-2 font-mono text-xs text-slate-200">{tool.name}</td>
                    <td className="px-4 py-2 text-slate-400">{tool.description}</td>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={tool.enabled}
                        onChange={(e) =>
                          toggleMutation.mutate({
                            connectionId: tool.connectionId,
                            toolName: tool.name,
                            enabled: e.target.checked,
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {grouped.size === 0 && <p className="text-slate-400">No tools available yet — add a connection first.</p>}
    </div>
  );
}
