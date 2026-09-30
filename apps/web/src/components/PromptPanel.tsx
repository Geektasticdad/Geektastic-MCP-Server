import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PromptDetail, PromptSummary } from "@geektastic/shared";
import { api } from "../api/client";
import { PromptRunner } from "./PromptRunner";

/**
 * Docked panel on a connection's Prompts tab for one prompt: on/off switch,
 * description, arguments, a Try it form and recent calls. `prompt` comes from
 * the list (so its enabled state updates optimistically); calls are fetched
 * per prompt.
 */
export function PromptPanel({
  prompt,
  busy,
  onToggle,
  onClose,
}: {
  prompt: PromptSummary;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["prompt", prompt.connectionId, prompt.name];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      api
        .get<{ prompt: PromptDetail }>(
          `/api/prompts/${encodeURIComponent(prompt.connectionId)}/${encodeURIComponent(prompt.name)}`,
        )
        .then((res) => res.prompt),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const args = prompt.arguments ?? [];
  const canTry = !!data && prompt.enabled && data.connectionEnabled;

  return (
    <aside
      aria-label={`${prompt.title} details`}
      className="fixed inset-y-0 right-0 z-20 flex w-full flex-col border-l border-slate-800 bg-slate-950 shadow-2xl sm:w-[32rem]"
    >
      <header className="flex items-start gap-3 border-b border-slate-800 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">
            {prompt.connectionName} · {prompt.category}
          </p>
          <h2 className="mt-0.5 text-base font-semibold text-white">{prompt.title}</h2>
          <p className="break-all font-mono text-xs text-slate-400">{prompt.name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-md px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          ×
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-slate-800 bg-slate-900 px-4 py-3">
          <span>
            <span className="block text-sm font-medium text-white">{prompt.enabled ? "Enabled" : "Disabled"}</span>
            <span className="block text-xs text-slate-400">
              {prompt.enabled
                ? "MCP clients can offer this prompt."
                : "Hidden from MCP clients and the playground."}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={prompt.enabled}
            disabled={busy}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-5 w-5 cursor-pointer accent-indigo-500"
          />
        </label>

        {data && !data.connectionEnabled && (
          <p className="rounded-md border border-amber-800 bg-amber-950 px-3 py-2 text-xs text-amber-300">
            The {prompt.connectionName} connection is disabled, so none of its prompts reach MCP clients right now.
          </p>
        )}

        <section>
          <h3 className="mb-2 text-sm font-medium text-white">Description</h3>
          <p className="whitespace-pre-line text-sm text-slate-400">{prompt.description}</p>
        </section>

        {/* The Try it form lists the same arguments, so this only shows when it can't. */}
        {!isLoading && !canTry && (
          <section>
            <h3 className="mb-2 text-sm font-medium text-white">Arguments</h3>
            {args.length === 0 ? (
              <p className="text-sm text-slate-500">This prompt takes no arguments.</p>
            ) : (
              <dl className="divide-y divide-slate-800 rounded-md border border-slate-800">
                {args.map((arg) => (
                  <div key={arg.name} className="px-3 py-2">
                    <dt className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <code className="text-slate-200">{arg.name}</code>
                      {arg.required ? (
                        <span className="text-xs text-red-400">required</span>
                      ) : (
                        <span className="text-xs text-slate-500">optional</span>
                      )}
                    </dt>
                    {arg.description && <dd className="mt-0.5 text-xs text-slate-400">{arg.description}</dd>}
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-medium text-white">Try it</h3>
          {isLoading && <p className="text-sm text-slate-400">Loading...</p>}
          {error && <p className="text-sm text-red-400">Couldn't load this prompt's details.</p>}
          {data &&
            (!prompt.enabled || !data.connectionEnabled ? (
              <p className="text-sm text-slate-500">
                {!prompt.enabled && !data.connectionEnabled
                  ? `Turn this prompt and the ${prompt.connectionName} connection on to try it here.`
                  : !prompt.enabled
                    ? "Turn this prompt on to try it here."
                    : `Turn the ${prompt.connectionName} connection on (in its Settings) to try it here.`}
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-slate-500">
                  Previewing builds the messages an MCP client would receive. It may read from{" "}
                  {prompt.connectionName}, but it never changes anything or sends anything to an AI model.
                </p>
                <PromptRunner
                  key={`${prompt.connectionId}:${prompt.name}`}
                  connectionId={prompt.connectionId}
                  promptName={prompt.name}
                  args={args}
                  onRan={() => void queryClient.invalidateQueries({ queryKey })}
                />
              </>
            ))}
        </section>

        {data && (
          <section>
            <h3 className="mb-2 text-sm font-medium text-white">Recent calls</h3>
            {data.recentCalls.length === 0 ? (
              <p className="text-sm text-slate-500">No calls yet.</p>
            ) : (
              <ul className="divide-y divide-slate-800 rounded-md border border-slate-800 text-xs">
                {data.recentCalls.map((call) => (
                  <li key={call.id} className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className={call.status === "success" ? "text-emerald-400" : "text-red-400"}>
                        {call.status}
                      </span>
                      <span className="text-slate-400">{call.durationMs} ms</span>
                      <span className="ml-auto text-slate-500">{new Date(call.createdAt).toLocaleString()}</span>
                    </div>
                    {call.errorSummary && (
                      <p className="mt-1 line-clamp-3 break-words text-red-300" title={call.errorSummary}>
                        {call.errorSummary}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
