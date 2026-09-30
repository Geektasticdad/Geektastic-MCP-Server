import type { ToolAccess, ToolDefinition } from "./types.js";

export interface ToolMeta {
  /** What the tool acts on, e.g. "Encounter" or "Research task" — one row in the Tools grid. */
  category: string;
  /** Short label for the tool within its category, e.g. "create" or "get pedigree". */
  action: string;
  access: ToolAccess;
}

const READ_VERBS = new Set(["list", "get", "search"]);
const DELETE_VERBS = new Set(["delete"]);

/**
 * Tools whose names don't follow `<prefix>_<verb>_<thing>` cleanly, or whose
 * thing belongs in another row. Keyed by full tool name. A connector can set
 * `category` on the ToolDefinition instead of adding an entry here.
 */
const CATEGORY_OVERRIDES: Record<string, string> = {
  ft_search: "Person",
  ft_search_people: "Person",
  ft_add_name: "Person",
  ft_update_name: "Person",
  ft_delete_name: "Person",
  ft_get_tree: "Tree",
  ft_list_trees: "Tree",
  ft_get_pedigree: "Tree",
  ft_get_descendants: "Tree",
  ft_get_relationship: "Tree",
  ft_set_home_person: "Tree",
  ft_get_duplicates_report: "Report",
  ft_get_gaps_report: "Report",
  ft_add_child: "Family",
  ft_remove_child: "Family",
  ft_update_child_relation: "Family",
  ft_tag_person_in_media: "Face tag",
  ft_log_search_attempt: "Research task",
  ft_delete_search_attempt: "Research task",
};

const ACRONYMS = new Set(["dna"]);

function singularize(word: string): string {
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function humanize(words: string[]): string {
  const text = words.map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w)).join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Groups a tool for the Web UI and MCP annotations. Explicit `category` /
 * `access` on the definition win; otherwise both are derived from the
 * `<prefix>_<verb>_<thing>` naming convention every connector follows.
 */
export function describeTool(def: Pick<ToolDefinition, "name" | "category" | "access">): ToolMeta {
  const [, verb = "", ...rest] = def.name.split("_");
  const derivedAccess: ToolAccess = READ_VERBS.has(verb) ? "read" : DELETE_VERBS.has(verb) ? "delete" : "write";

  const thing = rest.length > 0 ? humanize([...rest.slice(0, -1), singularize(rest[rest.length - 1])]) : "General";
  const category = def.category ?? CATEGORY_OVERRIDES[def.name] ?? thing;
  const action = category === thing ? verb : [verb, ...rest].join(" ");

  return { category, action, access: def.access ?? derivedAccess };
}
