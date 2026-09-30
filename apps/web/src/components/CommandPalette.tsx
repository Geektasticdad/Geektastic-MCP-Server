import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { AppConnectionSummary, PromptSummary, ToolSummary } from "@geektastic/shared";
import { api } from "../api/client";

interface Item {
  id: string;
  group: "Pages" | "Connections" | "Tools" | "Prompts";
  label: string;
  detail?: string;
  /** Shown as a small tag, e.g. "off" for a disabled tool. */
  tag?: string;
  href: string;
  /** Extra text to match on besides label and detail. */
  keywords?: string;
}

interface PlaygroundTool {
  connectionId: string;
  connectionName: string;
  name: string;
  description: string;
}

const PAGES: Array<{ label: string; href: string; adminOnly?: boolean; keywords?: string }> = [
  { label: "Overview", href: "/", keywords: "dashboard home health" },
  { label: "Activity", href: "/logs", keywords: "logs calls errors history" },
  { label: "Testing Playground", href: "/playground", keywords: "run try test" },
  { label: "Connections", href: "/connections", adminOnly: true, keywords: "apps add connection" },
  { label: "Tokens", href: "/tokens", adminOnly: true, keywords: "mcp bearer api keys" },
  { label: "OAuth Clients", href: "/oauth-clients", adminOnly: true, keywords: "claude desktop connector" },
  { label: "Users", href: "/users", adminOnly: true, keywords: "accounts members admins" },
  { label: "Profile", href: "/profile", keywords: "password account" },
];

const MAX_RESULTS = 60;

/**
 * Ctrl/Cmd+K search over pages, connections, tools and prompts. Data loads the
 * first time it opens. Admins jump to a tool's side panel on its connection
 * page; members (who can't manage connections) jump to it in the playground.
 */
export function CommandPalette({ open, onClose, isAdmin }: { open: boolean; onClose: () => void; isAdmin: boolean }) {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { data: connections } = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<{ connections: AppConnectionSummary[] }>("/api/connections"),
    enabled: open && isAdmin,
  });
  const { data: adminTools } = useQuery({
    queryKey: ["tools", "all"],
    queryFn: () => api.get<{ tools: ToolSummary[] }>("/api/tools"),
    enabled: open && isAdmin,
  });
  const { data: prompts } = useQuery({
    queryKey: ["prompts", "all"],
    queryFn: () => api.get<{ prompts: PromptSummary[] }>("/api/prompts"),
    enabled: open && isAdmin,
  });
  const { data: memberPrompts } = useQuery({
    queryKey: ["playground-prompts"],
    queryFn: () => api.get<{ prompts: Omit<PromptSummary, "enabled">[] }>("/api/playground/prompts"),
    enabled: open && !isAdmin,
  });
  const { data: memberTools } = useQuery({
    queryKey: ["playground-tools"],
    queryFn: () => api.get<{ tools: PlaygroundTool[] }>("/api/playground/tools"),
    enabled: open && !isAdmin,
  });

  const items = useMemo<Item[]>(() => {
    const list: Item[] = PAGES.filter((p) => isAdmin || !p.adminOnly).map((p) => ({
      id: `page:${p.href}`,
      group: "Pages",
      label: p.label,
      href: p.href,
      keywords: p.keywords,
    }));
    for (const c of connections?.connections ?? []) {
      list.push({
        id: `conn:${c.id}`,
        group: "Connections",
        label: c.name,
        detail: c.appName,
        tag: c.enabled ? undefined : "disabled",
        href: `/connections/${c.id}`,
      });
    }
    for (const t of adminTools?.tools ?? []) {
      list.push({
        id: `tool:${t.connectionId}:${t.name}`,
        group: "Tools",
        label: t.name,
        detail: `${t.connectionName} · ${t.category}`,
        tag: t.enabled ? undefined : "off",
        href: `/connections/${t.connectionId}/tools?tool=${encodeURIComponent(t.name)}`,
        keywords: `${t.action} ${t.access}`,
      });
    }
    for (const t of memberTools?.tools ?? []) {
      list.push({
        id: `tool:${t.connectionId}:${t.name}`,
        group: "Tools",
        label: t.name,
        detail: t.connectionName,
        href: `/playground?tool=${encodeURIComponent(`${t.connectionId}:${t.name}`)}`,
      });
    }
    for (const p of prompts?.prompts ?? []) {
      list.push({
        id: `prompt:${p.connectionId}:${p.name}`,
        group: "Prompts",
        label: p.title,
        detail: `${p.connectionName} · ${p.category}`,
        tag: p.enabled ? undefined : "off",
        href: `/connections/${p.connectionId}/prompts?prompt=${encodeURIComponent(p.name)}`,
        keywords: p.name,
      });
    }
    for (const p of memberPrompts?.prompts ?? []) {
      list.push({
        id: `prompt:${p.connectionId}:${p.name}`,
        group: "Prompts",
        label: p.title,
        detail: `${p.connectionName} · ${p.category}`,
        href: `/playground?mode=prompts&prompt=${encodeURIComponent(`${p.connectionId}:${p.name}`)}`,
        keywords: p.name,
      });
    }
    return list;
  }, [isAdmin, connections, adminTools, memberTools, prompts, memberPrompts]);

  const results = useMemo(() => {
    const terms = query.toLowerCase().replace(/_/g, " ").split(/\s+/).filter(Boolean);
    // With no query, list pages and connections rather than every tool.
    if (terms.length === 0) return items.filter((i) => i.group === "Pages" || i.group === "Connections");
    const needle = terms.join(" ");
    return items
      .map((item) => {
        const label = item.label.toLowerCase().replace(/_/g, " ");
        const haystack = `${label} ${item.detail ?? ""} ${item.keywords ?? ""}`.toLowerCase();
        if (!terms.every((t) => haystack.includes(t))) return null;
        const score = label === needle ? 0 : label.startsWith(needle) ? 1 : label.includes(needle) ? 2 : 3;
        return { item, score };
      })
      .filter((r): r is { item: Item; score: number } => r !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.item);
  }, [items, query]);

  // Reset whenever it opens; hand focus back to where it was when it closes.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
    return () => previous?.focus();
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  function go(item: Item | undefined) {
    if (!item) return;
    onClose();
    navigate(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  const loading = isAdmin ? !adminTools : !memberTools;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-xl overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search tools, prompts, connections and pages..."
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          className="w-full border-b border-slate-700 bg-transparent px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
        <ul ref={listRef} id={listId} role="listbox" className="max-h-[60vh] overflow-y-auto py-2">
          {results.map((item, index) => {
            const showGroup = index === 0 || results[index - 1].group !== item.group;
            return (
              <li key={item.id} role="presentation">
                {showGroup && (
                  <div className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {item.group}
                  </div>
                )}
                <div
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === active}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(item)}
                  className={`mx-2 flex cursor-pointer items-baseline gap-3 rounded-md px-2 py-1.5 text-sm ${
                    index === active ? "bg-indigo-600 text-white" : "text-slate-200"
                  }`}
                >
                  <span className={item.group === "Tools" ? "font-mono text-xs" : ""}>
                    {item.label}
                  </span>
                  {item.tag && (
                    <span className="rounded border border-slate-600 px-1 text-[10px] uppercase text-slate-400">
                      {item.tag}
                    </span>
                  )}
                  {item.detail && (
                    <span className={`ml-auto truncate text-xs ${index === active ? "text-indigo-100" : "text-slate-500"}`}>
                      {item.detail}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-500">
              {loading && query ? "Loading..." : "Nothing matches."}
            </li>
          )}
        </ul>
        <div className="flex gap-4 border-t border-slate-800 px-4 py-2 text-xs text-slate-500">
          <span>↑↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
