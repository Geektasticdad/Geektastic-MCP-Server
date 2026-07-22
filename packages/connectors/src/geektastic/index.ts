import { z } from "zod";
import type { AppConnector, ConnectorConfig, HealthCheckResult, ToolDefinition } from "../types.js";
import { GeektasticRealmsClient, parseConfig } from "./client.js";

/**
 * Connector for Geektastic Realms' "General-Purpose API" (see
 * geektastic-realms/Docs/API.md). All routes live under `/api/v1/` on the
 * instance's root origin — the client always prepends `/api/v1` itself, so
 * `baseUrl` should be just the origin (no path suffix). Auth is a per-world
 * Bearer token from that world's General API Access panel.
 */

const configSchema = z.object({
  baseUrl: z
    .string()
    .url()
    .describe("Root origin of the Geektastic Realms instance, e.g. https://realms.example.com (no /api suffix)"),
  apiKey: z
    .string()
    .min(1)
    .describe("Per-world bearer token from that world's General API Access panel (prefix grapi_)"),
});

const abilityScoresSchema = z.object({
  str: z.number().int(),
  dex: z.number().int(),
  con: z.number().int(),
  int: z.number().int(),
  wis: z.number().int(),
  cha: z.number().int(),
});

const featureSchema = z.object({
  type: z.enum([
    "trait",
    "spellcasting",
    "action",
    "bonus_action",
    "reaction",
    "legendary_action",
    "lair_action",
    "regional_effect",
  ]),
  name: z.string().min(1),
  description: z.string().optional().default(""),
});

/** Foundry VTT Stage 14 — optional structured spellcasting profile, one per stat block. */
const spellcastingSchema = z.object({
  ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
  save_dc_override: z.number().int().nullable().optional(),
  attack_override: z.number().int().nullable().optional(),
  description: z
    .string()
    .optional()
    .describe(
      'Plain-text spellcasting summary, e.g. "Eryssa is a 10th-level warlock. Her spellcasting ability is Charisma ' +
        '(spell save DC 18, +10 to hit with spell attacks). She has 2 spell slots of 5th level that recharge on a ' +
        'short or long rest." Rendered on the GR stat block display above the spell list.'
    ),
});

/**
 * A named spell on the structured spell list — matched against the world's synced
 * Foundry compendiums by exact name (case-insensitive), not fuzzy. `usage_type`
 * distinguishes standard/Pact Magic spell-slot casting (`slot`/`pact`, where `level`
 * is the spell's slot level) from Innate Spellcasting (`at_will`/`per_day`, where
 * `level` is unused and `per_day` additionally needs `uses_per_day`).
 */
const spellSchema = z.object({
  name: z.string().min(1),
  level: z.number().int().min(0).max(9).optional().default(0),
  usage_type: z.enum(["slot", "pact", "at_will", "per_day"]).optional().default("slot"),
  uses_per_day: z.number().int().min(1).max(99).nullable().optional(),
});

const itemSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["trinket", "weapon", "armor", "magic_item", "ammunition", "tool", "gear", "currency"]),
  quantity: z.number().int().optional().default(1),
  weight: z.number().optional().default(0),
  value_amount: z.number().optional().default(0),
  value_unit: z.enum(["gp", "sp", "cp", "ep", "pp"]).optional().default("gp"),
  properties: z.string().optional().default(""),
  requires_attunement: z.boolean().optional().default(false),
  attunement_description: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

/** gr-statblock-v1 — see Docs/statblock-template.json in the geektastic-realms repo. */
const statblockSchema = z.object({
  _format: z.literal("gr-statblock-v1").optional(),
  name: z.string().min(1),
  size: z.enum(["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"]),
  type: z.string().min(1),
  subtype: z.string().optional().default(""),
  alignment: z.string().optional().default(""),
  armor_class: z.number().int(),
  ac_note: z.string().optional().default(""),
  hit_points: z.number().int(),
  hit_dice: z.string().optional().default(""),
  speed: z.string().optional().default(""),
  abilities: abilityScoresSchema,
  saving_throws: z.string().optional().default(""),
  skills: z.string().optional().default(""),
  senses: z.string().optional().default(""),
  languages: z.string().optional().default(""),
  damage_vulnerabilities: z.string().optional().default(""),
  damage_resistances: z.string().optional().default(""),
  damage_immunities: z.string().optional().default(""),
  condition_immunities: z.string().optional().default(""),
  challenge_rating: z.string().min(1),
  xp: z.number().int().nullable().optional(),
  proficiency_bonus: z.number().int().nullable().optional(),
  spellcasting: spellcastingSchema.nullable().optional(),
  spells: z.array(spellSchema).optional().default([]),
  features: z.array(featureSchema).optional().default([]),
  items: z.array(itemSchema).optional().default([]),
});

/** gr-entry-v1 — custom_fields is a category-specific bag; Realms validates it server-side. */
const entrySchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  body_html: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  visibility: z.enum(["private", "members", "public"]).optional(),
  parent_id: z.number().int().nullable().optional(),
  tags: z.array(z.string()).optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});

/** gr-module-v1's own (non-nested) fields — the section tree is read-only via gr_get_module. */
const moduleSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  overview: z.string().optional(),
  level_range: z.string().optional(),
  party_size: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  visibility: z.enum(["private", "members", "public"]).optional(),
  campaign_id: z.number().int().nullable().optional(),
});

const sectionSchema = z.object({
  type: z.enum(["act", "chapter", "scene", "appendix"]),
  title: z.string().min(1),
  body_html: z.string().nullable().optional(),
  parent_id: z.number().int().nullable().optional(),
});

const handoutSchema = z.object({
  title: z.string().min(1),
  body_html: z.string().nullable().optional(),
  section_id: z.number().int().nullable().optional(),
  media_id: z.number().int().nullable().optional(),
});

const encounterAdversaryInputSchema = z.object({
  entry_id: z.coerce.number().int().describe("Entry id of a creature with a stat block in this world — find one via gr_search_statblocks."),
  quantity: z.coerce.number().int().min(1).optional().describe("Defaults to 1."),
});

const encounterSchema = z.object({
  name: z.string().min(1),
  encounter_type: z.enum(["combat", "social", "exploration", "puzzle", "trap", "other"]).optional(),
  difficulty: z.string().nullable().optional(),
  setup: z.string().nullable().optional(),
  tactics: z.string().nullable().optional(),
  rewards: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  adversaries: z
    .array(encounterAdversaryInputSchema)
    .optional()
    .describe(
      "Creatures in this fight. REPLACES the entire existing list on update (not a diff/append) — " +
        "omit this field to leave adversaries untouched, or send [] to clear them all. " +
        "Each entry_id must have a stat block (gr_search_statblocks) in this world."
    ),
});

const rollTableTypeOptions = [
  "Combat",
  "Environmental",
  "Exploration",
  "Hazard",
  "Loot",
  "Lore",
  "Traps & Triggers",
  "Weather & Travel",
] as const;

const rollTableRowSchema = z.object({
  range_start: z.coerce.number().int(),
  range_end: z.coerce.number().int().optional().describe("Defaults to range_start if omitted."),
  title: z.string().nullable().optional(),
  type: z.array(z.enum(rollTableTypeOptions)).optional(),
  description: z.string().nullable().optional(),
  dm_note: z.string().nullable().optional().describe("DM-only — never shown on the public page."),
});

const rollTableSchema = z.object({
  title: z.string().min(1),
  dm_notes: z.string().nullable().optional(),
  section_id: z.number().int().nullable().optional().describe("Omit or null for an adventure-level table."),
  rows: z
    .array(rollTableRowSchema)
    .optional()
    .describe(
      "REPLACES the entire existing row list on update (not a diff/append) — omit this field " +
        "to leave rows untouched, or send [] to clear them all."
    ),
});

const campaignSchema = z.object({
  title: z.string().min(1),
  summary: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["active", "paused", "complete", "planned"]).optional().describe("Defaults to active."),
});

const sessionLogSchema = z.object({
  title: z.string().min(1),
  played_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .describe("YYYY-MM-DD"),
  summary: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  next_session_prep: z.string().nullable().optional(),
  player_recap: z.string().nullable().optional().describe('The "Last time on…" recap for the next session opening.'),
  xp_awarded: z.coerce.number().int().min(0).nullable().optional(),
  gp_gained: z.coerce.number().min(0).nullable().optional(),
  loot_notes: z.string().nullable().optional(),
  sections_covered: z
    .array(z.coerce.number().int())
    .optional()
    .describe(
      "Section ids the party played through this session. REPLACES the entire existing list on " +
        "update — omit this field to leave it untouched, or send [] to clear it."
    ),
});

const eraSchema = z.object({
  name: z.string().min(1),
  era_label: z.string().nullable().optional().describe('Compact badge, e.g. "Era I".'),
  age_id: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Must reference a calendar age (epoch) already defined in this world's calendar. Omit/null for no epoch tie."),
  start_year: z.number().int().nullable().optional().describe("Epoch-relative year."),
  end_year: z.number().int().nullable().optional().describe("Epoch-relative year."),
  color: z.string().nullable().optional().describe("Hex color for the timeline bar, e.g. #6a89a8. Defaults to #6a89a8 on create."),
  description: z.string().nullable().optional(),
  dm_notes: z.string().nullable().optional().describe("DM-only — never shown publicly."),
});

const historyEventSchema = z.object({
  title: z.string().min(1),
  era_id: z.number().int().nullable().optional().describe("Must reference an era already in this world."),
  age_id: z.number().int().nullable().optional().describe("Must reference a calendar age already in this world."),
  year_in_epoch: z.coerce.number().int().nullable().optional(),
  month_number: z.coerce.number().int().nullable().optional(),
  day: z.coerce.number().int().nullable().optional(),
  body_html: z.string().nullable().optional(),
  dm_notes: z.string().nullable().optional().describe("DM-only — never shown publicly."),
  is_secret: z.boolean().optional().describe("Hides this event on all public-facing pages."),
});

function toResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toErrorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function client(cfg: ConnectorConfig): GeektasticRealmsClient {
  return new GeektasticRealmsClient(parseConfig(cfg));
}

const tools: ToolDefinition[] = [
  {
    name: "gr_search_statblocks",
    description:
      "Search this world's stat blocks by entry title or stat block name. Omit query to list everything (capped at 100 when a query is given).",
    inputSchema: z.object({ query: z.string().optional() }),
    async handler(input, cfg) {
      const { query } = z.object({ query: z.string().optional() }).parse(input);
      try {
        return toResult(await client(cfg).searchStatblocks(query));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_statblock",
    description: "Fetch a single Geektastic Realms statblock by entry id, in gr-statblock-v1 format.",
    inputSchema: z.object({ entry_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { entry_id } = z.object({ entry_id: z.coerce.number().int() }).parse(input);
      try {
        return toResult(await client(cfg).getStatblock(entry_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_statblock",
    description:
      "Create a new entry and statblock in Geektastic Realms (gr-statblock-v1 format). " +
      "category_id must reference a stat-block-capable category in the target world.",
    inputSchema: z.object({ category_id: z.number().int(), statblock: statblockSchema }),
    async handler(input, cfg) {
      const { category_id, statblock } = z
        .object({ category_id: z.number().int(), statblock: statblockSchema })
        .parse(input);
      try {
        return toResult(await client(cfg).createStatblock(category_id, statblock));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_statblock",
    description:
      "Update an existing Geektastic Realms statblock by entry id. Replaces the entire " +
      "features/items/spells arrays with what's posted (omitting spells clears them, " +
      "same as posting an empty array) — spellcasting is the one field that's a true " +
      "partial update: omit it to leave unchanged, or pass null to clear it.",
    inputSchema: z.object({ entry_id: z.coerce.number().int(), statblock: statblockSchema }),
    async handler(input, cfg) {
      const { entry_id, statblock } = z
        .object({ entry_id: z.coerce.number().int(), statblock: statblockSchema })
        .parse(input);
      try {
        return toResult(await client(cfg).updateStatblock(entry_id, statblock));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_list_campaigns",
    description: "List campaigns in Geektastic Realms.",
    inputSchema: z.object({}),
    async handler(_input, cfg) {
      try {
        return toResult(await client(cfg).listCampaigns());
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_campaign",
    description: "Fetch a single Geektastic Realms campaign by id.",
    inputSchema: z.object({ id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { id } = z.object({ id: z.coerce.number().int() }).parse(input);
      try {
        return toResult(await client(cfg).getCampaign(id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_search_entries",
    description:
      "Search this world's lore entries (any category — NPCs, locations, items, etc.) by title, or " +
      "list every entry in one category. gr-entry-v1 format; distinct from statblocks (an entry can " +
      "have both a statblock and generic custom fields).",
    inputSchema: z.object({ category_id: z.coerce.number().int().optional(), query: z.string().optional() }),
    async handler(input, cfg) {
      const { category_id, query } = z
        .object({ category_id: z.coerce.number().int().optional(), query: z.string().optional() })
        .parse(input);
      try {
        return toResult(await client(cfg).searchEntries(category_id, query));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_entry",
    description: "Fetch a single Geektastic Realms lore entry by id, in gr-entry-v1 format (with custom_fields and tags).",
    inputSchema: z.object({ entry_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { entry_id } = z.object({ entry_id: z.coerce.number().int() }).parse(input);
      try {
        return toResult(await client(cfg).getEntry(entry_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_entry",
    description:
      "Create a new lore entry in any category (gr-entry-v1 format). custom_fields is keyed by each " +
      "field's stable key (see the category's field definitions), not its numeric id. " +
      "image/gallery/map fields are read-only via this API.",
    inputSchema: z.object({ category_id: z.coerce.number().int(), entry: entrySchema }),
    async handler(input, cfg) {
      const { category_id, entry } = z
        .object({ category_id: z.coerce.number().int(), entry: entrySchema })
        .parse(input);
      try {
        return toResult(await client(cfg).createEntry(category_id, entry));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_entry",
    description: "Update an existing Geektastic Realms lore entry by id.",
    inputSchema: z.object({ entry_id: z.coerce.number().int(), entry: entrySchema }),
    async handler(input, cfg) {
      const { entry_id, entry } = z
        .object({ entry_id: z.coerce.number().int(), entry: entrySchema })
        .parse(input);
      try {
        return toResult(await client(cfg).updateEntry(entry_id, entry));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_list_modules",
    description: "List adventure modules in this world.",
    inputSchema: z.object({}),
    async handler(_input, cfg) {
      try {
        return toResult(await client(cfg).listModules());
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_module",
    description:
      "Fetch a single Geektastic Realms adventure module by id, in gr-module-v1 format — the lightweight " +
      "Act/Chapter/Scene/Appendix outline (no body text; encounters/handouts are name-only). " +
      "Use gr_get_section to read a specific section's full content.",
    inputSchema: z.object({ module_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id } = z.object({ module_id: z.coerce.number().int() }).parse(input);
      try {
        return toResult(await client(cfg).getModule(module_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_module",
    description: "Create a new adventure module in this world (gr-module-v1's own fields; no sections yet).",
    inputSchema: z.object({ module: moduleSchema }),
    async handler(input, cfg) {
      const { module } = z.object({ module: moduleSchema }).parse(input);
      try {
        return toResult(await client(cfg).createModule(module));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_module",
    description: "Update an existing Geektastic Realms adventure module by id.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), module: moduleSchema }),
    async handler(input, cfg) {
      const { module_id, module } = z
        .object({ module_id: z.coerce.number().int(), module: moduleSchema })
        .parse(input);
      try {
        return toResult(await client(cfg).updateModule(module_id, module));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_search_sections",
    description:
      "Search for an Act/Chapter/Scene/Appendix by title across every module in this world, without " +
      "needing to already know which module it's in. Returns lightweight matches (module_id + section_id); " +
      "use gr_get_section to fetch full content.",
    inputSchema: z.object({
      query: z.string().optional(),
      type: z.enum(["act", "chapter", "scene", "appendix"]).optional(),
    }),
    async handler(input, cfg) {
      const { query, type } = z
        .object({ query: z.string().optional(), type: z.enum(["act", "chapter", "scene", "appendix"]).optional() })
        .parse(input);
      try {
        return toResult(await client(cfg).searchSections(query, type));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_section",
    description:
      "Fetch one section's full content (body_html, full encounters/handouts, one level of lightweight " +
      "children) by module id + section id. This is how to actually read an Act/Chapter/Scene's text — " +
      "gr_get_module only returns the lightweight outline.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), section_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id, section_id } = z
        .object({ module_id: z.coerce.number().int(), section_id: z.coerce.number().int() })
        .parse(input);
      try {
        return toResult(await client(cfg).getSection(module_id, section_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_section",
    description:
      "Create an Act, Chapter, Scene, or Appendix within a module. parent_id, if given, must be another " +
      "section already in the same module (e.g. a Chapter's parent_id is its Act's section id).",
    inputSchema: z.object({ module_id: z.coerce.number().int(), section: sectionSchema }),
    async handler(input, cfg) {
      const { module_id, section } = z
        .object({ module_id: z.coerce.number().int(), section: sectionSchema })
        .parse(input);
      try {
        return toResult(await client(cfg).createSection(module_id, section));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_section",
    description: "Update an existing Act/Chapter/Scene/Appendix section by id.",
    inputSchema: z.object({
      module_id: z.coerce.number().int(),
      section_id: z.coerce.number().int(),
      section: sectionSchema,
    }),
    async handler(input, cfg) {
      const { module_id, section_id, section } = z
        .object({
          module_id: z.coerce.number().int(),
          section_id: z.coerce.number().int(),
          section: sectionSchema,
        })
        .parse(input);
      try {
        return toResult(await client(cfg).updateSection(module_id, section_id, section));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_handout",
    description:
      "Create a handout in a module — module-level (omit section_id) or attributed to a specific section.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), handout: handoutSchema }),
    async handler(input, cfg) {
      const { module_id, handout } = z
        .object({ module_id: z.coerce.number().int(), handout: handoutSchema })
        .parse(input);
      try {
        return toResult(await client(cfg).createHandout(module_id, handout));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_handout",
    description: "Update an existing handout by id.",
    inputSchema: z.object({
      module_id: z.coerce.number().int(),
      handout_id: z.coerce.number().int(),
      handout: handoutSchema,
    }),
    async handler(input, cfg) {
      const { module_id, handout_id, handout } = z
        .object({
          module_id: z.coerce.number().int(),
          handout_id: z.coerce.number().int(),
          handout: handoutSchema,
        })
        .parse(input);
      try {
        return toResult(await client(cfg).updateHandout(module_id, handout_id, handout));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_encounter",
    description:
      "Create an encounter within a specific section (Scene, typically) of a module. " +
      "Optionally set its adversaries (creatures in the fight) in the same call — " +
      "look up entry_ids first with gr_search_statblocks.",
    inputSchema: z.object({
      module_id: z.coerce.number().int(),
      section_id: z.coerce.number().int(),
      encounter: encounterSchema,
    }),
    async handler(input, cfg) {
      const { module_id, section_id, encounter } = z
        .object({
          module_id: z.coerce.number().int(),
          section_id: z.coerce.number().int(),
          encounter: encounterSchema,
        })
        .parse(input);
      try {
        return toResult(await client(cfg).createEncounter(module_id, section_id, encounter));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_encounter",
    description:
      "Update an existing encounter by id. Sending `adversaries` replaces the whole list — " +
      "fetch the encounter's current adversaries first (via gr_get_section) if you only want " +
      "to add or remove one creature rather than resetting the roster.",
    inputSchema: z.object({
      module_id: z.coerce.number().int(),
      encounter_id: z.coerce.number().int(),
      encounter: encounterSchema,
    }),
    async handler(input, cfg) {
      const { module_id, encounter_id, encounter } = z
        .object({
          module_id: z.coerce.number().int(),
          encounter_id: z.coerce.number().int(),
          encounter: encounterSchema,
        })
        .parse(input);
      try {
        return toResult(await client(cfg).updateEncounter(module_id, encounter_id, encounter));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_encounter",
    description: "Fetch a single encounter by id (with resolved adversaries), without pulling the whole section.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), encounter_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id, encounter_id } = z
        .object({ module_id: z.coerce.number().int(), encounter_id: z.coerce.number().int() })
        .parse(input);
      try {
        return toResult(await client(cfg).getEncounter(module_id, encounter_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_handout",
    description: "Fetch a single handout by id, without pulling the whole section.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), handout_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id, handout_id } = z
        .object({ module_id: z.coerce.number().int(), handout_id: z.coerce.number().int() })
        .parse(input);
      try {
        return toResult(await client(cfg).getHandout(module_id, handout_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_campaign",
    description: "Create a campaign — a named arc grouping several adventure modules. Cover image is web-editor-only.",
    inputSchema: z.object({ campaign: campaignSchema }),
    async handler(input, cfg) {
      const { campaign } = z.object({ campaign: campaignSchema }).parse(input);
      try {
        return toResult(await client(cfg).createCampaign(campaign));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_campaign",
    description: "Update an existing campaign by id.",
    inputSchema: z.object({ campaign_id: z.coerce.number().int(), campaign: campaignSchema }),
    async handler(input, cfg) {
      const { campaign_id, campaign } = z
        .object({ campaign_id: z.coerce.number().int(), campaign: campaignSchema })
        .parse(input);
      try {
        return toResult(await client(cfg).updateCampaign(campaign_id, campaign));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_list_roll_tables",
    description:
      "List every roll table in a module (lightweight — id, title, die, row count; adventure-level tables " +
      "have section_id: null). Use gr_get_roll_table to read a specific table's rows.",
    inputSchema: z.object({ module_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id } = z.object({ module_id: z.coerce.number().int() }).parse(input);
      try {
        return toResult(await client(cfg).listRollTables(module_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_roll_table",
    description: "Fetch one roll table's full detail, including every row, by module id + roll table id.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), roll_table_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id, roll_table_id } = z
        .object({ module_id: z.coerce.number().int(), roll_table_id: z.coerce.number().int() })
        .parse(input);
      try {
        return toResult(await client(cfg).getRollTable(module_id, roll_table_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_roll_table",
    description:
      "Create a roll table within a module — wandering monsters, loot, rumors, etc. Adventure-level " +
      "(omit section_id) or attributed to a specific section. Each row needs at least range_start " +
      "(range_end defaults to range_start); the die size is computed automatically from the highest range_end.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), roll_table: rollTableSchema }),
    async handler(input, cfg) {
      const { module_id, roll_table } = z
        .object({ module_id: z.coerce.number().int(), roll_table: rollTableSchema })
        .parse(input);
      try {
        return toResult(await client(cfg).createRollTable(module_id, roll_table));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_roll_table",
    description:
      "Update an existing roll table by id. Sending `rows` replaces the entire list — fetch the table " +
      "first (gr_get_roll_table) if you only want to add or edit one row rather than resetting them all.",
    inputSchema: z.object({
      module_id: z.coerce.number().int(),
      roll_table_id: z.coerce.number().int(),
      roll_table: rollTableSchema,
    }),
    async handler(input, cfg) {
      const { module_id, roll_table_id, roll_table } = z
        .object({
          module_id: z.coerce.number().int(),
          roll_table_id: z.coerce.number().int(),
          roll_table: rollTableSchema,
        })
        .parse(input);
      try {
        return toResult(await client(cfg).updateRollTable(module_id, roll_table_id, roll_table));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_list_sessions",
    description:
      "List every session logged for a module (lightweight — title, played_on, xp/gp, no summary/notes " +
      "body text). Use gr_get_session to read one session's full recap and sections_covered.",
    inputSchema: z.object({ module_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id } = z.object({ module_id: z.coerce.number().int() }).parse(input);
      try {
        return toResult(await client(cfg).listSessions(module_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_session",
    description:
      "Fetch one session log's full detail — summary, notes, next_session_prep, player_recap, xp/gp/loot, " +
      "and sections_covered — for 'previously on…' continuity.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), session_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id, session_id } = z
        .object({ module_id: z.coerce.number().int(), session_id: z.coerce.number().int() })
        .parse(input);
      try {
        return toResult(await client(cfg).getSession(module_id, session_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_session",
    description:
      "Log a new session for a module — hand this messy notes and it becomes the recap, next-session prep, " +
      "and player recap. xp_awarded/gp_gained store exactly what's sent (0 is a valid awarded amount).",
    inputSchema: z.object({ module_id: z.coerce.number().int(), session: sessionLogSchema }),
    async handler(input, cfg) {
      const { module_id, session } = z
        .object({ module_id: z.coerce.number().int(), session: sessionLogSchema })
        .parse(input);
      try {
        return toResult(await client(cfg).createSession(module_id, session));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_session",
    description:
      "Update an existing session log by id. Sending `sections_covered` replaces the entire list — " +
      "fetch the session first (gr_get_session) if you only want to add one section rather than resetting it.",
    inputSchema: z.object({
      module_id: z.coerce.number().int(),
      session_id: z.coerce.number().int(),
      session: sessionLogSchema,
    }),
    async handler(input, cfg) {
      const { module_id, session_id, session } = z
        .object({
          module_id: z.coerce.number().int(),
          session_id: z.coerce.number().int(),
          session: sessionLogSchema,
        })
        .parse(input);
      try {
        return toResult(await client(cfg).updateSession(module_id, session_id, session));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_list_eras",
    description:
      "List every era (named historical period) in this world's history. Requires the connection's token " +
      "to have `history` scope, separate from entries/modules/campaigns/foundry.",
    inputSchema: z.object({}),
    async handler(_input, cfg) {
      try {
        return toResult(await client(cfg).listEras());
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_era",
    description: "Fetch a single era by id.",
    inputSchema: z.object({ era_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { era_id } = z.object({ era_id: z.coerce.number().int() }).parse(input);
      try {
        return toResult(await client(cfg).getEra(era_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_era",
    description: "Create a new era in this world's history (e.g. \"The Seraphic Conquest\").",
    inputSchema: z.object({ era: eraSchema }),
    async handler(input, cfg) {
      const { era } = z.object({ era: eraSchema }).parse(input);
      try {
        return toResult(await client(cfg).createEra(era));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_era",
    description: "Update an existing era by id.",
    inputSchema: z.object({ era_id: z.coerce.number().int(), era: eraSchema }),
    async handler(input, cfg) {
      const { era_id, era } = z.object({ era_id: z.coerce.number().int(), era: eraSchema }).parse(input);
      try {
        return toResult(await client(cfg).updateEra(era_id, era));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_list_events",
    description:
      "List every historical event in this world. Requires the connection's token to have `history` scope.",
    inputSchema: z.object({}),
    async handler(_input, cfg) {
      try {
        return toResult(await client(cfg).listEvents());
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_event",
    description: "Fetch a single historical event by id.",
    inputSchema: z.object({ event_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { event_id } = z.object({ event_id: z.coerce.number().int() }).parse(input);
      try {
        return toResult(await client(cfg).getEvent(event_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_event",
    description: "File a new historical event in this world — a discrete moment, optionally grouped under an era.",
    inputSchema: z.object({ event: historyEventSchema }),
    async handler(input, cfg) {
      const { event } = z.object({ event: historyEventSchema }).parse(input);
      try {
        return toResult(await client(cfg).createEvent(event));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_event",
    description: "Update an existing historical event by id.",
    inputSchema: z.object({ event_id: z.coerce.number().int(), event: historyEventSchema }),
    async handler(input, cfg) {
      const { event_id, event } = z
        .object({ event_id: z.coerce.number().int(), event: historyEventSchema })
        .parse(input);
      try {
        return toResult(await client(cfg).updateEvent(event_id, event));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_delete_entry",
    description:
      "Permanently delete a lore entry — its stat block, custom field values, tags, and relations are " +
      "cascade-deleted too. There is no undo.",
    inputSchema: z.object({ entry_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { entry_id } = z.object({ entry_id: z.coerce.number().int() }).parse(input);
      try {
        return toResult(await client(cfg).deleteEntry(entry_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_delete_section",
    description:
      "Permanently delete an Act/Chapter/Scene/Appendix. Child sections and encounters attached to it are " +
      "cascade-deleted; handouts and roll tables attributed to it are detached (become adventure-level) " +
      "rather than deleted. There is no undo.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), section_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id, section_id } = z
        .object({ module_id: z.coerce.number().int(), section_id: z.coerce.number().int() })
        .parse(input);
      try {
        return toResult(await client(cfg).deleteSection(module_id, section_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_delete_encounter",
    description: "Permanently delete an encounter (its adversary links go with it). There is no undo.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), encounter_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id, encounter_id } = z
        .object({ module_id: z.coerce.number().int(), encounter_id: z.coerce.number().int() })
        .parse(input);
      try {
        return toResult(await client(cfg).deleteEncounter(module_id, encounter_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_delete_handout",
    description: "Permanently delete a handout. There is no undo.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), handout_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id, handout_id } = z
        .object({ module_id: z.coerce.number().int(), handout_id: z.coerce.number().int() })
        .parse(input);
      try {
        return toResult(await client(cfg).deleteHandout(module_id, handout_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
];

export const geektasticRealmsConnector: AppConnector = {
  id: "geektastic-realms",
  displayName: "Geektastic Realms",
  configSchema,
  async healthCheck(cfg): Promise<HealthCheckResult> {
    try {
      const result = await client(cfg).ping();
      return { ok: true, detail: `${result.setting.name} (Realms v${result.gr_version})` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },
  getTools(_cfg) {
    return tools;
  },
};
