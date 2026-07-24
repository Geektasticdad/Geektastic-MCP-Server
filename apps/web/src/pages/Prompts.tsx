import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { PromptSummary } from "@geektastic/shared";

export function Prompts() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["prompts"],
    queryFn: () => api.get<{ prompts: PromptSummary[] }>("/api/prompts"),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { connectionId: string; promptName: string; enabled: boolean }) =>
      api.post("/api/prompts/toggle", input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["prompts"] }),
  });

  if (isLoading) return <p className="text-slate-400">Loading...</p>;

  const grouped = new Map<string, PromptSummary[]>();
  for (const prompt of data?.prompts ?? []) {
    const list = grouped.get(prompt.connectionName) ?? [];
    list.push(prompt);
    grouped.set(prompt.connectionName, list);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">Prompts</h1>
      <p className="max-w-2xl text-sm text-slate-400">
        Reusable MCP prompt templates — seeded conversation starters an MCP client can offer the user directly
        (distinct from Tools, which the model calls itself). Enable/disable per connection, same as Tools.
      </p>
      {[...grouped.entries()].map(([connectionName, prompts]) => (
        <section key={connectionName}>
          <h2 className="mb-3 text-lg font-medium text-white">{connectionName}</h2>
          <div className="overflow-hidden rounded-md border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-4 py-2">Prompt</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Arguments</th>
                  <th className="px-4 py-2">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {prompts.map((prompt) => (
                  <tr key={prompt.name} className="border-t border-slate-800">
                    <td className="px-4 py-2 font-mono text-xs text-slate-200">{prompt.name}</td>
                    <td className="px-4 py-2 text-slate-400">{prompt.description}</td>
                    <td className="px-4 py-2 text-xs text-slate-400">
                      {(prompt.arguments ?? []).map((arg) => (
                        <div key={arg.name}>
                          <code>{arg.name}</code>
                          {arg.required && <span className="text-red-400"> *</span>}
                        </div>
                      ))}
                      {(prompt.arguments ?? []).length === 0 && "—"}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={prompt.enabled}
                        onChange={(e) =>
                          toggleMutation.mutate({
                            connectionId: prompt.connectionId,
                            promptName: prompt.name,
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
      {grouped.size === 0 && <p className="text-slate-400">No prompts available yet — add a connection first.</p>}
    </div>
  );
}
