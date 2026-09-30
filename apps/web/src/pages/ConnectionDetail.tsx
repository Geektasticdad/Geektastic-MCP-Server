import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, NavLink, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { AppConnectionSummary, PromptSummary, ToolCallLogEntry, ToolSummary } from "@geektastic/shared";
import { ToolsGrid } from "../components/ToolsGrid";
import { PromptsList } from "../components/PromptsList";
import { ActivityLog } from "../components/ActivityLog";
import { StatusBadge } from "./Connections";
import { BASE_URL_APIKEY_CONNECTORS, inputClass, primaryButton, secondaryButton } from "../connectorFields";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "tools", label: "Tools" },
  { id: "prompts", label: "Prompts" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function ConnectionDetail() {
  const { id = "", tab = "overview" } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["connection", id],
    queryFn: () => api.get<{ connection: AppConnectionSummary }>(`/api/connections/${encodeURIComponent(id)}`),
    refetchInterval: 30000,
  });

  if (!TABS.some((t) => t.id === tab)) return <Navigate to={`/connections/${id}`} replace />;
  if (isLoading) return <p className="text-slate-400">Loading...</p>;
  if (error || !data) {
    return (
      <div className="space-y-3">
        <p className="text-red-400">
          {error instanceof ApiError && error.status === 404 ? "This connection doesn't exist." : "Couldn't load it."}
        </p>
        <Link to="/connections" className="text-sm text-indigo-400 hover:underline">
          Back to connections
        </Link>
      </div>
    );
  }

  const connection = data.connection;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/connections" className="text-sm text-slate-400 hover:text-white">
          ← Connections
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">{connection.name}</h1>
          <StatusBadge connection={connection} />
        </div>
        <p className="mt-1 break-all text-sm text-slate-500">
          {connection.appName} · {connection.baseUrl}
        </p>
      </div>

      <nav aria-label="Connection sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-800">
        {TABS.map((t) => (
          <NavLink
            key={t.id}
            to={t.id === "overview" ? `/connections/${id}` : `/connections/${id}/${t.id}`}
            end
            className={({ isActive }) =>
              `whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "border-indigo-500 text-white" : "border-transparent text-slate-400 hover:text-white"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <TabContent tab={tab as TabId} connection={connection} />
    </div>
  );
}

function TabContent({ tab, connection }: { tab: TabId; connection: AppConnectionSummary }) {
  switch (tab) {
    case "overview":
      return <Overview connection={connection} />;
    case "tools":
      return <ToolsGrid connectionId={connection.id} />;
    case "prompts":
      return <PromptsList connectionId={connection.id} />;
    case "activity":
      return <ActivityLog connectionId={connection.id} />;
    case "settings":
      return <Settings connection={connection} />;
  }
}

function Overview({ connection }: { connection: AppConnectionSummary }) {
  const base = `/connections/${connection.id}`;
  const idParam = encodeURIComponent(connection.id);
  const { data: tools } = useQuery({
    queryKey: ["tools", connection.id],
    queryFn: () => api.get<{ tools: ToolSummary[] }>(`/api/tools?connectionId=${idParam}`),
  });
  const { data: prompts } = useQuery({
    queryKey: ["prompts", connection.id],
    queryFn: () => api.get<{ prompts: PromptSummary[] }>(`/api/prompts?connectionId=${idParam}`),
  });
  const { data: logs } = useQuery({
    queryKey: ["logs", "recent", connection.id],
    queryFn: () => api.get<{ logs: ToolCallLogEntry[] }>(`/api/logs?connectionId=${idParam}&limit=5`),
    refetchInterval: 15000,
  });
  const testMutation = useMutation({
    mutationFn: () => api.post<{ ok: boolean; detail?: string }>(`/api/connections/${idParam}/test`),
  });

  const toolList = tools?.tools ?? [];
  const readOnly = toolList.length > 0 && toolList.every((t) => t.enabled === (t.access === "read"));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Health</div>
          <div className={`mt-1 text-lg font-semibold ${connection.health?.ok ? "text-emerald-400" : "text-red-400"}`}>
            {!connection.enabled ? "Disabled" : connection.health?.ok ? "Healthy" : "Unhealthy"}
          </div>
          {connection.enabled && !connection.health?.ok && connection.health?.detail && (
            <p className="mt-1 break-words text-xs text-slate-400">{connection.health.detail}</p>
          )}
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className={`${secondaryButton} mt-3 text-xs`}
          >
            {testMutation.isPending ? "Testing..." : "Test now"}
          </button>
          {testMutation.data && (
            <p className={`mt-2 text-xs ${testMutation.data.ok ? "text-emerald-400" : "text-red-300"}`}>
              {testMutation.data.ok ? "Connected successfully." : testMutation.data.detail ?? "Failed."}
            </p>
          )}
        </div>
        <Link to={`${base}/tools`} className="rounded-md border border-slate-800 bg-slate-900 p-4 hover:border-slate-600">
          <div className="text-xs uppercase tracking-wide text-slate-500">Tools</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {tools ? `${toolList.filter((t) => t.enabled).length} of ${toolList.length} on` : "…"}
          </div>
          {readOnly && <p className="mt-1 text-xs text-slate-400">Read-only</p>}
        </Link>
        <Link
          to={`${base}/prompts`}
          className="rounded-md border border-slate-800 bg-slate-900 p-4 hover:border-slate-600"
        >
          <div className="text-xs uppercase tracking-wide text-slate-500">Prompts</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {prompts
              ? prompts.prompts.length === 0
                ? "None"
                : `${prompts.prompts.filter((p) => p.enabled).length} of ${prompts.prompts.length} on`
              : "…"}
          </div>
        </Link>
      </div>

      {!connection.enabled && (
        <p className="rounded-md border border-amber-800 bg-amber-950 px-3 py-2 text-sm text-amber-300">
          This connection is disabled, so none of its tools or prompts reach MCP clients. Turn it back on in{" "}
          <Link to={`${base}/settings`} className="underline">
            Settings
          </Link>
          .
        </p>
      )}

      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-medium text-white">Recent tool calls</h2>
          <Link to={`${base}/activity`} className="ml-auto text-sm text-indigo-400 hover:underline">
            See all activity
          </Link>
        </div>
        {logs && logs.logs.length === 0 ? (
          <p className="text-sm text-slate-500">No calls yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800 rounded-md border border-slate-800 text-sm">
            {logs?.logs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                <Link
                  to={`${base}/tools?tool=${encodeURIComponent(log.toolName)}`}
                  className="font-mono text-xs text-slate-200 hover:underline"
                >
                  {log.toolName}
                </Link>
                <span className={log.status === "success" ? "text-emerald-400" : "text-red-400"}>{log.status}</span>
                <span className="text-slate-400">{log.durationMs} ms</span>
                <span className="ml-auto text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Settings({ connection }: { connection: AppConnectionSummary }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const idParam = encodeURIComponent(connection.id);
  const fields = BASE_URL_APIKEY_CONNECTORS[connection.appType];

  const [name, setName] = useState(connection.name);
  const [baseUrl, setBaseUrl] = useState(connection.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["connection", connection.id] });
    void queryClient.invalidateQueries({ queryKey: ["connections"] });
  };

  const saveMutation = useMutation({
    mutationFn: (body: { name?: string; config?: Record<string, unknown> }) =>
      api.patch(`/api/connections/${idParam}`, body),
    onSuccess: () => {
      setApiKey("");
      setSaved(true);
      refresh();
    },
  });
  const enableMutation = useMutation({
    mutationFn: (enabled: boolean) => api.patch(`/api/connections/${idParam}`, { enabled }),
    onSuccess: refresh,
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/connections/${idParam}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
      void queryClient.invalidateQueries({ queryKey: ["tools"] });
      navigate("/connections");
    },
  });

  function onSave(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const body: { name?: string; config?: Record<string, unknown> } = {};
    if (name !== connection.name) body.name = name;
    if (fields && (baseUrl !== connection.baseUrl || apiKey)) {
      // The server merges this over the stored config, so a blank API key keeps the current one.
      body.config = { baseUrl, ...(apiKey ? { apiKey } : {}) };
    }
    if (Object.keys(body).length > 0) saveMutation.mutate(body);
    else setSaved(true);
  }

  return (
    <div className="max-w-lg space-y-8">
      <form onSubmit={onSave} className="space-y-3 rounded-md border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-lg font-medium text-white">Details</h2>
        {saveMutation.isError && (
          <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
            {saveMutation.error instanceof ApiError ? saveMutation.error.message : "Couldn't save."}
          </div>
        )}
        <div>
          <label htmlFor="conn-name" className="mb-1 block text-sm text-slate-300">
            Connection name
          </label>
          <input
            id="conn-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        {fields && (
          <>
            <div>
              <label htmlFor="conn-url" className="mb-1 block text-sm text-slate-300">
                Base URL
              </label>
              <input
                id="conn-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={fields.baseUrlPlaceholder}
                required
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-500">{fields.baseUrlHint}</p>
            </div>
            <div>
              <label htmlFor="conn-key" className="mb-1 block text-sm text-slate-300">
                API key
              </label>
              <input
                id="conn-key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="Leave blank to keep the current key"
                className={inputClass}
              />
            </div>
          </>
        )}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saveMutation.isPending} className={primaryButton}>
            {saveMutation.isPending ? "Saving..." : "Save changes"}
          </button>
          {saved && !saveMutation.isPending && <span className="text-sm text-emerald-400">Saved.</span>}
        </div>
      </form>

      <section className="space-y-2 rounded-md border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-lg font-medium text-white">{connection.enabled ? "Enabled" : "Disabled"}</h2>
        <p className="text-sm text-slate-400">
          {connection.enabled
            ? "Disabling hides every tool and prompt from this connection from MCP clients and the playground, without losing any settings."
            : "None of this connection's tools or prompts reach MCP clients. Enable it to restore them with their previous settings."}
        </p>
        <button
          type="button"
          onClick={() => enableMutation.mutate(!connection.enabled)}
          disabled={enableMutation.isPending}
          className={secondaryButton}
        >
          {connection.enabled ? "Disable connection" : "Enable connection"}
        </button>
      </section>

      <section className="space-y-2 rounded-md border border-red-900 p-5">
        <h2 className="text-lg font-medium text-red-300">Delete connection</h2>
        <p className="text-sm text-slate-400">
          Permanently removes this connection and its tool and prompt settings. Call logs are kept. This can't be
          undone.
        </p>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete the connection "${connection.name}"? This can't be undone.`)) deleteMutation.mutate();
          }}
          disabled={deleteMutation.isPending}
          className="rounded-md bg-red-950 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900 disabled:opacity-50"
        >
          Delete connection
        </button>
      </section>
    </div>
  );
}
