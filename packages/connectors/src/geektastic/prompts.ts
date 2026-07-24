import type { ConnectorConfig, PromptDefinition, PromptMessage } from "../types.js";
import { GeektasticRealmsClient, parseConfig, type GrSessionSummary, type GrStatblockSummary } from "./client.js";

/**
 * MCP prompts for Geektastic Realms — DM-workflow templates that actively
 * fetch bounded context via the same REST client the tools use, then hand the
 * model a concrete task. See Tech_Docs/07-Connector-SDK.md "Prompts" and
 * ROADMAP.md Phase 8.
 */

function client(cfg: ConnectorConfig): GeektasticRealmsClient {
  return new GeektasticRealmsClient(parseConfig(cfg));
}

function requireArg(args: Record<string, string>, name: string): string {
  const value = args[name];
  if (!value) throw new Error(`Missing required argument "${name}"`);
  return value;
}

function requireIntArg(args: Record<string, string>, name: string): number {
  const raw = requireArg(args, name);
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) throw new Error(`Argument "${name}" must be an integer, got "${raw}"`);
  return value;
}

function userMessage(text: string): PromptMessage[] {
  return [{ role: "user", text }];
}

/** Most recently played session — GR returns sessions in creation order, so the highest id is latest. */
function mostRecent(sessions: GrSessionSummary[]): GrSessionSummary | undefined {
  return sessions.reduce<GrSessionSummary | undefined>(
    (latest, s) => (!latest || s.id > latest.id ? s : latest),
    undefined,
  );
}

const sessionPrep: PromptDefinition = {
  name: "gr_session_prep",
  description:
    "Prep for the next session of a module: reads the module outline and the most recent session log, " +
    "then asks the model to pull the next unplayed section(s) and draft a prep sheet.",
  arguments: [
    { name: "module_id", description: "Module id to prep for (see gr_list_modules).", required: true },
  ],
  async handler(args, cfg) {
    const moduleId = requireIntArg(args, "module_id");
    const c = client(cfg);

    const moduleDetail = await c.getModule(moduleId);
    const { sessions } = await c.listSessions(moduleId);
    const latestSummary = mostRecent(sessions);
    const latestSession = latestSummary ? await c.getSession(moduleId, latestSummary.id) : undefined;

    const parts: string[] = [
      `# Session prep — module ${moduleId}`,
      "",
      "## Module outline",
      "```json",
      JSON.stringify(moduleDetail.module, null, 2),
      "```",
    ];

    if (latestSession) {
      parts.push(
        "",
        `## Most recent session log (id ${latestSession.session.id}${
          latestSession.session.played_on ? `, played ${latestSession.session.played_on}` : ""
        })`,
        `**Summary:** ${latestSession.session.summary || "(none logged)"}`,
        `**Next-session prep notes:** ${latestSession.session.next_session_prep || "(none logged)"}`,
        `**Sections covered so far:** ${JSON.stringify(latestSession.session.sections_covered)}`,
      );
    } else {
      parts.push("", "## Session log", "No sessions logged yet for this module — this will be the first one.");
    }

    parts.push(
      "",
      "## Task",
      "Using the outline and `sections_covered` above, identify the next 1-2 sections the party hasn't reached " +
        "yet, then call `gr_get_section` on those to pull their full content before you continue. Once you have " +
        "that, draft a session prep sheet covering:",
      "1. A short recap of where the story left off.",
      "2. The likely upcoming encounters, NPCs, and key decision points in the next section(s).",
      "3. A DM prep checklist (stat blocks to look up or create, handouts to have ready, roll tables to have on hand).",
      "4. Any open plot threads worth reminding the DM about.",
    );

    return { description: `Session prep for module ${moduleId}`, messages: userMessage(parts.join("\n")) };
  },
};

const recapWriter: PromptDefinition = {
  name: "gr_recap_writer",
  description:
    "Turn messy raw session notes into a polished, read-aloud recap for players plus a DM-facing continuity list.",
  arguments: [
    { name: "session_notes", description: "Raw, messy notes about what happened this session.", required: true },
    {
      name: "module_id",
      description: "Module id, to pull the previous session's recap for continuity (optional).",
    },
  ],
  async handler(args, cfg) {
    const sessionNotes = requireArg(args, "session_notes");
    const moduleId = args.module_id ? Number.parseInt(args.module_id, 10) : undefined;

    let priorRecap: string | undefined;
    if (moduleId !== undefined && Number.isFinite(moduleId)) {
      const c = client(cfg);
      const { sessions } = await c.listSessions(moduleId);
      const latest = mostRecent(sessions);
      if (latest) {
        const detail = await c.getSession(moduleId, latest.id);
        priorRecap = detail.session.player_recap || detail.session.summary || undefined;
      }
    }

    const parts: string[] = ["# Raw session notes", "", sessionNotes];
    if (priorRecap) {
      parts.push("", "# Previous session's recap (for continuity)", "", priorRecap);
    }
    parts.push(
      "",
      "# Task",
      "From the raw notes above, produce two things:",
      "1. A polished, in-character, read-aloud recap for players (150-300 words) that flows naturally from the " +
        (priorRecap ? "previous recap." : "campaign so far."),
      "2. A short DM-facing bullet list of continuity facts worth logging: NPCs met, promises made, loot gained, " +
        "threads opened or closed.",
      "When you're done, offer to log this session via `gr_create_session` or `gr_update_session` " +
        "(`player_recap` for #1, `notes`/`loot_notes` for #2).",
    );

    return { description: "Session recap writer", messages: userMessage(parts.join("\n")) };
  },
};

const statblockFromDescription: PromptDefinition = {
  name: "gr_statblock_from_description",
  description:
    "Design a D&D 5e-compatible stat block from a natural-language creature concept, with CR-appropriate " +
    "design guidance, ready to file via gr_create_statblock.",
  arguments: [
    { name: "description", description: "Natural-language creature concept.", required: true },
    { name: "challenge_rating", description: "Target challenge rating, if you have one in mind." },
  ],
  async handler(args) {
    const description = requireArg(args, "description");
    const cr = args.challenge_rating;

    const parts = [
      `# Creature concept`,
      "",
      description,
      "",
      cr ? `Target challenge rating: ${cr}` : "No target CR given — pick one that fits the concept's implied power level.",
      "",
      "# Design guidance",
      "As a rough calibration (not exact, use judgment): low-CR creatures (0-4) generally sit around AC 12-16, " +
        "HP under 100, and a handful of straightforward attacks; mid-CR (5-10) pushes toward AC 15-18, HP in the " +
        "hundreds, multiattack, and one or two signature abilities; high-CR (11-16) adds resistances/immunities, " +
        "legendary or lair actions, and larger damage dice; CR 17+ is boss-tier — expect legendary resistances, " +
        "multiple damage types, and abilities that shape the whole encounter. Action economy (multiattack, bonus " +
        "actions, reactions, legendary actions for solo bosses) matters more to a fight's difficulty than raw " +
        "numbers alone.",
      "",
      "# Task",
      "Design a full stat block for this concept: size, type, AC, HP, speed, six ability scores, saves/skills/" +
        "senses/languages as relevant, damage/condition modifiers if thematic, a challenge rating, and a features " +
        "list (traits/actions/bonus actions/reactions/legendary or lair actions as fitting the CR). Add items only " +
        "if the concept calls for equipment. When ready, call `gr_create_statblock` — use `gr_search_entries` or " +
        "ask which category to file it under if that's not already known.",
    ];

    return { description: "Stat block design brief", messages: userMessage(parts.join("\n")) };
  },
};

function formatCandidates(statblocks: GrStatblockSummary[]): string {
  if (statblocks.length === 0) return "(no matching stat blocks found — consider gr_statblock_from_description to design one)";
  return statblocks.map((s) => `- entry_id ${s.entry_id}: **${s.name}** — ${s.category}, CR ${s.challenge_rating}`).join("\n");
}

const populateEncounter: PromptDefinition = {
  name: "gr_populate_encounter",
  description:
    "Pick a CR-budget-balanced roster of adversaries from this world's existing stat blocks for a new encounter.",
  arguments: [
    { name: "module_id", description: "Module id the encounter belongs to.", required: true },
    { name: "section_id", description: "Section id (typically a Scene) to attach the encounter to.", required: true },
    { name: "cr_budget", description: "Target total challenge rating budget for the fight.", required: true },
    { name: "theme", description: "Optional theme/environment to narrow candidates (e.g. \"swamp\", \"undead\")." },
  ],
  async handler(args, cfg) {
    const moduleId = requireIntArg(args, "module_id");
    const sectionId = requireIntArg(args, "section_id");
    const crBudget = requireArg(args, "cr_budget");
    const theme = args.theme;

    const c = client(cfg);
    const { statblocks } = await c.searchStatblocks(theme);

    const parts = [
      `# Encounter target`,
      `Module ${moduleId}, section ${sectionId}. Target CR budget: ${crBudget}.${theme ? ` Theme: ${theme}.` : ""}`,
      "",
      "# Candidate stat blocks in this world" + (theme ? ` (filtered by "${theme}")` : ""),
      formatCandidates(statblocks),
      "",
      "# Task",
      "Select a balanced mix of adversaries from the candidates above that fits the CR budget — show your " +
        "multiple-monster math (a group of same-CR creatures fights harder than one creature of the summed CR; " +
        "weigh the total party threat, not just a flat CR sum). If nothing above fits, search further with " +
        "`gr_search_statblocks` or design a new one with `gr_statblock_from_description`. Once you've chosen, " +
        "call `gr_create_encounter` on module " +
        `${moduleId}, section ${sectionId} with an \`adversaries\` array of { entry_id, quantity } and a name/setup/tactics ` +
        "that fits the scene.",
    ];

    return { description: "Encounter roster builder", messages: userMessage(parts.join("\n")) };
  },
};

export function getGeektasticPrompts(): PromptDefinition[] {
  return [sessionPrep, recapWriter, statblockFromDescription, populateEncounter];
}
