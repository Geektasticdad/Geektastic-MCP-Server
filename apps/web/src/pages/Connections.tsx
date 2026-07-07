import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { AppConnectionSummary } from "@geektastic/shared";

interface ConnectorOption {
  id: string;
  displayName: string;
}

export function Connections() {
  const queryClient = useQueryClient();
  const { data: connections } = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<{ connections: AppConnectionSummary[] }>("/api/connections"),
    refetchInterval: 15000,
  });
  const { data: connectors } = useQuery({
    queryKey: ["connectors"],
    queryFn: () => api.get<{ connectors: ConnectorOption[] }>("/api/connections/connectors"),
  });

  const [appType, setAppType] = useState("geektastic-realms");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [rawConfig, setRawConfig] = useState("{}");
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: { appType: string; name: string; config: Record<string, unknown> }) =>
      api.post("/api/connections", body),
    onSuccess: () => {
      setName("");
      setBaseUrl("");
      setApiKey("");
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : "Failed to create connection"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.patch(`/api/connections/${id}`, { enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["connections"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/connections/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["connections"] }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean; detail?: string }>(`/api/connections/${id}/test`),
  });

  const isKnownConnector = appType === "geektastic-realms";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    let config: Record<string, unknown>;
    if (isKnownConnector) {
      config = { baseUrl, apiKey };
    } else {
      try {
        config = JSON.parse(rawConfig);
      } catch {
        setFormError("Config must be valid JSON");
        return;
      }
    }
    createMutation.mutate({ appType, name, config });
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">Connections</h1>

      <form onSubmit={onSubmit} className="max-w-lg space-y-3 rounded-md border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-lg font-medium text-white">Add connection</h2>
        {formError && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{formError}</div>}
        <div>
          <label className="mb-1 block text-sm text-slate-300">Application</label>
          <select
            value={appType}
            onChange={(e) => setAppType(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            {(connectors?.connectors ?? [{ id: "geektastic-realms", displayName: "Geektastic Realms" }]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">Connection name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        {isKnownConnector ? (
          <>
            <div>
              <label className="mb-1 block text-sm text-slate-300">Base URL</label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://realms.example.com/api"
                required
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-300">API key</label>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type="password"
                required
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1 block text-sm text-slate-300">Config (JSON)</label>
            <textarea
              value={rawConfig}
              onChange={(e) => setRawConfig(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
            />
          </div>
        )}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Add connection
        </button>
      </form>

      <div className="space-y-2">
        {connections?.connections.map((conn) => (
          <div key={conn.id} className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-white">{conn.name}</div>
                <div className="text-xs text-slate-500">
                  {conn.appType} &middot; {conn.baseUrl}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={conn.health?.ok ? "text-xs text-emerald-400" : "text-xs text-red-400"}>
                  {conn.health?.ok ? "Healthy" : conn.health?.detail ?? "Unknown"}
                </span>
                <button
                  onClick={() => testMutation.mutate(conn.id)}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                >
                  Test
                </button>
                <button
                  onClick={() => toggleMutation.mutate({ id: conn.id, enabled: !conn.enabled })}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                >
                  {conn.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete connection "${conn.name}"?`)) deleteMutation.mutate(conn.id);
                  }}
                  className="rounded-md bg-red-950 px-3 py-1.5 text-xs text-red-300 hover:bg-red-900"
                >
                  Delete
                </button>
              </div>
            </div>
            {testMutation.data && testMutation.variables === conn.id && (
              <div className="mt-2 text-xs text-slate-400">
                Test result: {testMutation.data.ok ? "OK" : testMutation.data.detail}
              </div>
            )}
          </div>
        ))}
        {connections?.connections.length === 0 && <p className="text-slate-400">No connections yet.</p>}
      </div>
    </div>
  );
}
