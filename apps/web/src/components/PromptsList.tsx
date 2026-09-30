import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { PromptSummary } from "@geektastic/shared";
import { PromptPanel } from "./PromptPanel";

const presetButton =
  "rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50";

interface PromptChange {
  promptName: string;
  enabled: boolean;
}

/**
 * One connection's MCP prompts as cards grouped by category, each with its
 * own switch; clicking a card opens its side panel. The open prompt's name is
 * kept in `?prompt=` so it can be linked to.
 */
export function PromptsList({ connectionId }: { connectionId: string }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const openName = searchParams.get("prompt");
  const openPrompt = useCallback(
    (prompt: PromptSummary) => setSearchParams({ prompt: prompt.name }, { replace: true }),
    [setSearchParams],
  );
  const closePanel = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams]);

  const queryKey = ["prompts", connectionId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      api.get<{ prompts: PromptSummary[] }>(`/api/prompts?connectionId=${encodeURIComponent(connectionId)}`),
  });

  const bulkMutation = useMutation({
    mutationFn: (changes: PromptChange[]) => api.post("/api/prompts/bulk", { connectionId, changes }),
    // Optimistic, so switches flip immediately; the refetch in onSettled corrects any failure.
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey });
      const next = new Map(changes.map((c) => [c.promptName, c.enabled]));
      queryClient.setQueryData<{ prompts: PromptSummary[] }>(queryKey, (old) =>
        old
          ? { prompts: old.prompts.map((p) => (next.has(p.name) ? { ...p, enabled: next.get(p.name)! } : p)) }
          : old,
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["prompts"] }),
  });

  function apply(prompts: PromptSummary[], enabled: boolean) {
    const changes = prompts.filter((p) => p.enabled !== enabled).map((p) => ({ promptName: p.name, enabled }));
    if (changes.length > 0) bulkMutation.mutate(changes);
  }

  const prompts = data?.prompts ?? [];
  const groups = useMemo(() => {
    const byCategory = new Map<string, PromptSummary[]>();
    for (const prompt of prompts) {
      const list = byCategory.get(prompt.category) ?? [];
      list.push(prompt);
      byCategory.set(prompt.category, list);
    }
    return [...byCategory.entries()];
  }, [prompts]);

  if (isLoading) return <p className="text-slate-400">Loading...</p>;
  if (prompts.length === 0) {
    return <p className="text-slate-400">This connection doesn't offer any prompts.</p>;
  }

  const busy = bulkMutation.isPending;
  const enabledCount = prompts.filter((p) => p.enabled).length;
  const openedPrompt = openName ? prompts.find((p) => p.name === openName) : undefined;

  return (
    <div className={`space-y-6 ${openedPrompt ? "xl:mr-[32rem]" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="max-w-2xl text-sm text-slate-400">
          {enabledCount} of {prompts.length} prompts on. Prompts are ready-made conversation starters an MCP client
          offers you to pick — unlike tools, which the AI calls on its own. Click one to see its arguments and try it.
        </p>
        <div className="flex gap-2 sm:ml-auto">
          <button
            type="button"
            disabled={busy}
            className={presetButton}
            onClick={() => apply(prompts, true)}
          >
            Enable all
          </button>
          <button
            type="button"
            disabled={busy}
            className={presetButton}
            onClick={() => apply(prompts, false)}
          >
            Disable all
          </button>
        </div>
      </div>

      {groups.map(([category, list]) => (
        <section key={category}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{category}</h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {list.map((prompt) => {
              const args = prompt.arguments ?? [];
              const required = args.filter((a) => a.required).length;
              const isOpen = openName === prompt.name;
              return (
                <li
                  key={prompt.name}
                  className={`flex gap-3 rounded-md border bg-slate-900 p-4 transition-colors ${
                    isOpen ? "border-indigo-500" : "border-slate-800 hover:border-slate-600"
                  } ${prompt.enabled ? "" : "opacity-70"}`}
                >
                  <button
                    type="button"
                    onClick={() => openPrompt(prompt)}
                    aria-current={isOpen ? "true" : undefined}
                    className="min-w-0 flex-1 self-start text-left"
                  >
                    <span className="block font-medium text-white">{prompt.title}</span>
                    <span className="block truncate font-mono text-xs text-slate-500">{prompt.name}</span>
                    <span className="mt-2 line-clamp-2 text-sm text-slate-400">{prompt.description}</span>
                    <span className="mt-2 block text-xs text-slate-500">
                      {args.length === 0
                        ? "No arguments"
                        : `${required} required · ${args.length - required} optional`}
                    </span>
                  </button>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={prompt.enabled}
                    disabled={busy}
                    onChange={(e) => apply([prompt], e.target.checked)}
                    aria-label={`${prompt.title} ${prompt.enabled ? "enabled" : "disabled"}`}
                    title={prompt.enabled ? "Turn this prompt off" : "Turn this prompt on"}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-indigo-500"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {openedPrompt && (
        <PromptPanel
          prompt={openedPrompt}
          busy={busy}
          onToggle={(enabled) => apply([openedPrompt], enabled)}
          onClose={closePanel}
        />
      )}
    </div>
  );
}
