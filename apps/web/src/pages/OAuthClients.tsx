import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { OAuthClientSummary } from "@geektastic/shared";

export function OAuthClients() {
  const queryClient = useQueryClient();
  const { data, error: listError } = useQuery({
    queryKey: ["oauth-clients"],
    queryFn: () => api.get<{ clients: OAuthClientSummary[] }>("/api/oauth-clients"),
  });

  const [clientName, setClientName] = useState("");
  const [redirectUrisText, setRedirectUrisText] = useState("");
  const [newClientId, setNewClientId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: { clientName: string; redirectUris: string[] }) =>
      api.post<{ client: OAuthClientSummary }>("/api/oauth-clients", body),
    onSuccess: (result) => {
      setNewClientId(result.client.id);
      setClientName("");
      setRedirectUrisText("");
      setCreateError(null);
      void queryClient.invalidateQueries({ queryKey: ["oauth-clients"] });
    },
    onError: (err) => setCreateError(err instanceof ApiError ? err.message : "Failed to create OAuth client"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/oauth-clients/${id}/revoke`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["oauth-clients"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const redirectUris = redirectUrisText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    createMutation.mutate({ clientName, redirectUris });
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">OAuth Clients</h1>
      <p className="max-w-2xl text-sm text-slate-400">
        Claude Desktop and Claude.ai's Custom Connector setup usually registers itself automatically (no client
        needed here). Create one manually only if you want to paste a specific Client ID into a connector's
        advanced settings — e.g. Claude.ai's redirect URI is{" "}
        <code className="rounded bg-slate-800 px-1 py-0.5">https://claude.ai/api/mcp/auth_callback</code>.
      </p>

      {newClientId && (
        <div className="max-w-2xl rounded-md border border-emerald-800 bg-emerald-950 p-4 text-sm text-emerald-200">
          <p className="mb-2 font-medium">
            Paste this Client ID into the connector's "OAuth Client ID" field (no client secret needed — this
            server only issues public, PKCE-based clients).
          </p>
          <code className="block break-all rounded bg-black/30 p-2">{newClientId}</code>
          <button className="mt-2 text-xs text-emerald-400 underline" onClick={() => setNewClientId(null)}>
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="max-w-lg space-y-3 rounded-md border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-lg font-medium text-white">Register a client manually</h2>
        {createError && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{createError}</div>}
        <div>
          <label className="mb-1 block text-sm text-slate-300">Client name</label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            required
            placeholder="e.g. Claude.ai"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">Redirect URI(s), one per line</label>
          <textarea
            value={redirectUrisText}
            onChange={(e) => setRedirectUrisText(e.target.value)}
            required
            rows={2}
            placeholder="https://claude.ai/api/mcp/auth_callback"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
          />
        </div>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Create client
        </button>
      </form>

      {listError && (
        <div className="max-w-2xl rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
          {listError instanceof ApiError ? listError.message : "Failed to load OAuth clients"}
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Client ID</th>
              <th className="px-4 py-2">Redirect URIs</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {data?.clients.map((client) => (
              <tr key={client.id} className="border-t border-slate-800 align-top">
                <td className="px-4 py-2 text-slate-200">{client.clientName}</td>
                <td className="max-w-xs truncate px-4 py-2 font-mono text-xs text-slate-400" title={client.id}>
                  {client.id}
                </td>
                <td className="max-w-xs px-4 py-2 text-xs text-slate-400">
                  {client.redirectUris.map((uri) => (
                    <div key={uri} className="truncate">
                      {uri}
                    </div>
                  ))}
                </td>
                <td className="px-4 py-2 text-xs uppercase text-slate-500">{client.registrationSource}</td>
                <td className="px-4 py-2">
                  {client.revokedAt ? (
                    <span className="text-red-400">Revoked</span>
                  ) : (
                    <span className="text-emerald-400">Active</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {!client.revokedAt && (
                    <button
                      onClick={() => revokeMutation.mutate(client.id)}
                      className="rounded-md bg-red-950 px-3 py-1 text-xs text-red-300 hover:bg-red-900"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data?.clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-3 text-slate-500">
                  No OAuth clients registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
