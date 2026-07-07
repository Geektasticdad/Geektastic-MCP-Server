import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { McpTokenSummary } from "@geektastic/shared";

export function Tokens() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api.get<{ tokens: McpTokenSummary[] }>("/api/tokens"),
  });

  const [name, setName] = useState("");
  const [newRawToken, setNewRawToken] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (tokenName: string) =>
      api.post<{ token: McpTokenSummary; rawToken: string }>("/api/tokens", { name: tokenName }),
    onSuccess: (result) => {
      setNewRawToken(result.rawToken);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["tokens"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/tokens/${id}/revoke`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tokens"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate(name);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">MCP Tokens</h1>

      {newRawToken && (
        <div className="max-w-2xl rounded-md border border-emerald-800 bg-emerald-950 p-4 text-sm text-emerald-200">
          <p className="mb-2 font-medium">
            Copy this token now — it will not be shown again. Use it as{" "}
            <code>Authorization: Bearer &lt;token&gt;</code> when connecting an MCP client.
          </p>
          <code className="block break-all rounded bg-black/30 p-2">{newRawToken}</code>
          <button className="mt-2 text-xs text-emerald-400 underline" onClick={() => setNewRawToken(null)}>
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="flex max-w-lg items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-sm text-slate-300">Token name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Claude Desktop"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Create token
        </button>
      </form>

      <div className="overflow-hidden rounded-md border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Last used</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {data?.tokens.map((token) => (
              <tr key={token.id} className="border-t border-slate-800">
                <td className="px-4 py-2 text-slate-200">{token.name}</td>
                <td className="px-4 py-2 text-slate-400">{new Date(token.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2 text-slate-400">
                  {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : "Never"}
                </td>
                <td className="px-4 py-2">
                  {token.revokedAt ? <span className="text-red-400">Revoked</span> : <span className="text-emerald-400">Active</span>}
                </td>
                <td className="px-4 py-2">
                  {!token.revokedAt && (
                    <button
                      onClick={() => revokeMutation.mutate(token.id)}
                      className="rounded-md bg-red-950 px-3 py-1 text-xs text-red-300 hover:bg-red-900"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
