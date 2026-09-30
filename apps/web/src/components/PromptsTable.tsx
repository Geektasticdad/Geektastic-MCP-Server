import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { PromptSummary } from "@geektastic/shared";

/** One connection's MCP prompts, each with an enable checkbox. */
export function PromptsTable({ connectionId }: { connectionId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["prompts", connectionId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get<{ prompts: PromptSummary[] }>(`/api/prompts?connectionId=${encodeURIComponent(connectionId)}`),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { promptName: string; enabled: boolean }) =>
      api.post("/api/prompts/toggle", { connectionId, ...input }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["prompts"] }),
  });

  if (isLoading) return <p className="text-slate-400">Loading...</p>;
  const prompts = data?.prompts ?? [];

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-slate-400">
        Reusable conversation starters an MCP client can offer you directly — unlike tools, which the model calls on
        its own.
      </p>
      {prompts.length === 0 ? (
        <p className="text-slate-400">This connection has no prompts.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full min-w-[640px] text-left text-sm">
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
                <tr key={prompt.name} className="border-t border-slate-800 align-top">
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
                      aria-label={`Enable ${prompt.name}`}
                      disabled={toggleMutation.isPending}
                      onChange={(e) => toggleMutation.mutate({ promptName: prompt.name, enabled: e.target.checked })}
                      className="h-4 w-4 cursor-pointer accent-indigo-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
