import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { AppConnectionSummary, ToolSummary } from "@geektastic/shared";
import { BASE_URL_APIKEY_CONNECTORS, inputClass, primaryButton, secondaryButton } from "../connectorFields";

interface ConnectorOption {
  id: string;
  displayName: string;
}

export function Connections() {
  const { data: connections, isLoading } = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<{ connections: AppConnectionSummary[] }>("/api/connections"),
    refetchInterval: 15000,
  });
  const { data: tools } = useQuery({
    queryKey: ["tools", "all"],
    queryFn: () => api.get<{ tools: ToolSummary[] }>("/api/tools"),
  });
  const [adding, setAdding] = useState(false);

  const list = connections?.connections ?? [];
  const showForm = adding || (!isLoading && list.length === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-white">Connections</h1>
        {!showForm && (
          <button type="button" onClick={() => setAdding(true)} className={`${primaryButton} ml-auto`}>
            Add connection
          </button>
        )}
      </div>
      <p className="max-w-2xl text-sm text-slate-400">
        Each connection links this server to one app. Open one to manage its tools and prompts, see its activity, or
        change its settings.
      </p>

      {showForm && <AddConnectionForm onCancel={list.length > 0 ? () => setAdding(false) : undefined} />}

      {isLoading && <p className="text-slate-400">Loading...</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {list.map((conn) => {
          const connTools = tools?.tools.filter((t) => t.connectionId === conn.id) ?? [];
          return (
            <Link
              key={conn.id}
              to={`/connections/${conn.id}`}
              className="block rounded-md border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-600"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-white">{conn.name}</div>
                  <div className="truncate text-xs text-slate-500">
                    {conn.appName} · {conn.baseUrl}
                  </div>
                </div>
                <StatusBadge connection={conn} />
              </div>
              {conn.enabled && conn.health && !conn.health.ok && conn.health.detail && (
                <div className="mt-2 break-words text-xs text-red-300">{conn.health.detail}</div>
              )}
              {tools && (
                <div className="mt-3 text-xs text-slate-400">
                  {connTools.filter((t) => t.enabled).length} of {connTools.length} tools enabled
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Disabled / Unknown / Healthy / Unhealthy (hover for the health check's detail). */
export function StatusBadge({ connection }: { connection: AppConnectionSummary }) {
  if (!connection.enabled) {
    return <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">Disabled</span>;
  }
  if (!connection.health) {
    return <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">Unknown</span>;
  }
  return connection.health.ok ? (
    <span className="shrink-0 rounded-full bg-emerald-950 px-2 py-0.5 text-xs text-emerald-300">Healthy</span>
  ) : (
    <span className="shrink-0 rounded-full bg-red-950 px-2 py-0.5 text-xs text-red-300" title={connection.health.detail}>
      Unhealthy
    </span>
  );
}

function AddConnectionForm({ onCancel }: { onCancel?: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
      api.post<{ id: string }>("/api/connections", body),
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
      void queryClient.invalidateQueries({ queryKey: ["tools"] });
      navigate(`/connections/${id}`);
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : "Failed to create connection"),
  });

  const knownConnectorFields = BASE_URL_APIKEY_CONNECTORS[appType];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    let config: Record<string, unknown>;
    if (knownConnectorFields) {
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
    <form onSubmit={onSubmit} className="max-w-lg space-y-3 rounded-md border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-lg font-medium text-white">Add connection</h2>
      {formError && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{formError}</div>}
      <div>
        <label htmlFor="new-conn-app" className="mb-1 block text-sm text-slate-300">
          Application
        </label>
        <select id="new-conn-app" value={appType} onChange={(e) => setAppType(e.target.value)} className={inputClass}>
          {(
            connectors?.connectors ?? [
              { id: "geektastic-realms", displayName: "Geektastic Realms" },
              { id: "family-tree", displayName: "Geektastic Family Tree" },
            ]
          ).map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="new-conn-name" className="mb-1 block text-sm text-slate-300">
          Connection name
        </label>
        <input id="new-conn-name" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
      </div>
      {knownConnectorFields ? (
        <>
          <div>
            <label htmlFor="new-conn-url" className="mb-1 block text-sm text-slate-300">
              Base URL
            </label>
            <input
              id="new-conn-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={knownConnectorFields.baseUrlPlaceholder}
              required
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">{knownConnectorFields.baseUrlHint}</p>
          </div>
          <div>
            <label htmlFor="new-conn-key" className="mb-1 block text-sm text-slate-300">
              API key
            </label>
            <input
              id="new-conn-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
              required
              placeholder={knownConnectorFields.apiKeyPlaceholder}
              className={inputClass}
            />
          </div>
        </>
      ) : (
        <div>
          <label htmlFor="new-conn-config" className="mb-1 block text-sm text-slate-300">
            Config (JSON)
          </label>
          <textarea
            id="new-conn-config"
            value={rawConfig}
            onChange={(e) => setRawConfig(e.target.value)}
            rows={4}
            className={`${inputClass} font-mono text-xs`}
          />
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={createMutation.isPending} className={primaryButton}>
          Add connection
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButton}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
