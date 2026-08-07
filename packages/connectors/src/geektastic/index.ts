import { z } from "zod";
import type { AppConnector, ConnectorConfig, HealthCheckResult, ToolDefinition } from "../types.js";
import { GeektasticRealmsClient, parseConfig } from "./client.js";
import { getGeektasticPrompts } from "./prompts.js";
import { getCampaignBuilderPrompts } from "./campaign/index.js";

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

/**
 * Roadmap 2.8 follow-up — one damage part on an Attack/Save/Damage/Heal Activity,
 * e.g. a poisoned dagger's Attack activity carrying both {"formula": "1d4",
 * "damage_type": "piercing"} and {"formula": "3d6", "damage_type": "poison"}. A
 * Heal activity only ever uses the first part — dnd5e's `healing` field is a
 * single value, not a list.
 */
const damagePartSchema = z.object({
  formula: z
    .string()
    .min(1)
    .describe(
      'Dice notation, e.g. "2d6 + 4". A simple "NdM [+/- bonus]" shape is parsed into structured dice on the ' +
        "Foundry side; anything more complex (multiple dice terms, a flat number, free text) is passed through " +
        "as a custom formula instead."
    ),
  damage_type: z
    .enum([
      "acid",
      "bludgeoning",
      "cold",
      "fire",
      "force",
      "lightning",
      "necrotic",
      "piercing",
      "poison",
      "psychic",
      "radiant",
      "slashing",
      "thunder",
    ])
    .nullable()
    .optional(),
});

/**
 * Roadmap 2.8 — a structured dnd5e Activity attached to a feature or item, so a
 * synced Feature/Weapon arrives in Foundry with a real rollable button instead of
 * inert flavor text. Deliberately no "cast" activity_type — an NPC's Innate
 * Spellcasting Cast activities are generated entirely module-side from the stat
 * block's own Spell List (`spells[]` above) once spells are cloned during Foundry
 * sync; there's nothing to hand-enter here, and no Foundry UUID this connector
 * could supply ahead of that sync happening in a specific world.
 */
const activitySchema = z.object({
  activity_type: z.enum(["attack", "check", "damage", "heal", "save"]),
  name: z.string().nullable().optional().describe('Optional label shown on the activity itself, e.g. "Bite".'),
  activation_type: z
    .enum(["action", "bonus", "reaction", "legendary", "lair", "special", "none"])
    .optional()
    .default("action")
    .describe(
      '"none" means passive — dnd5e shows the feature as Passive automatically whenever none of its activities ' +
        "has an activation cost, so there's no separate Passive flag to set."
    ),
  activation_value: z.number().int().nullable().optional(),
  range_value: z.string().nullable().optional(),
  range_units: z.enum(["ft", "mi", "self", "touch", "spec"]).optional().default("ft"),
  target_count: z.string().nullable().optional(),
  target_type: z.string().nullable().optional(),
  ability: z
    .enum(["str", "dex", "con", "int", "wis", "cha"])
    .nullable()
    .optional()
    .describe("Attack's attack-roll ability, or Check's ability."),
  attack_bonus: z.string().nullable().optional().describe('Attack only, e.g. "+5".'),
  attack_type: z.enum(["melee", "ranged"]).nullable().optional().describe("Attack only."),
  save_ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]).nullable().optional().describe("Save only."),
  save_dc: z.number().int().nullable().optional().describe("Save only."),
  save_effect: z.enum(["none", "half"]).optional().default("none").describe("Save only — effect on a successful save."),
  check_skill_or_tool: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Check only. A Foundry skill abbreviation (acr, ani, arc, ath, dec, his, ins, itm, inv, med, nat, prc, prf, " +
        "per, rel, slt, ste, sur) resolves to a real skill check; anything else is treated as a free-text tool name."
    ),
  check_dc: z.number().int().nullable().optional().describe("Check only."),
  damage_parts: z
    .array(damagePartSchema)
    .optional()
    .default([])
    .describe(
      "One or more damage parts, for Attack/Save/Damage/Heal. Most activities need just one, e.g. " +
        '[{"formula": "2d6 + 4", "damage_type": "slashing"}] — but a creature/weapon that deals more than one ' +
        'kind of damage in one hit can list several, e.g. a poisoned dagger: [{"formula": "1d4", "damage_type": ' +
        '"piercing"}, {"formula": "3d6", "damage_type": "poison"}]. A Heal activity only uses the first part.'
    ),
});

/** Roadmap 2.8 — a feature's or item's limited-uses pool, e.g. a wand's charges or a Breath Weapon's "Recharge 5-6". */
const usesSchema = z.object({
  max: z.string().nullable().optional().describe('A number or a dice formula, e.g. "3" or "1d4".'),
  recovery_period: z
    .enum(["lr", "sr", "day", "dawn", "dusk", "recharge", "special"])
    .nullable()
    .optional()
    .describe("lr = long rest, sr = short rest."),
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
  level: z
    .number()
    .int()
    .min(1)
    .max(20)
    .nullable()
    .optional()
    .describe("Roadmap 2.8 — required-level prerequisite, e.g. a feature that only applies from a certain level on."),
  repeatable: z.boolean().optional().default(false).describe("Roadmap 2.8."),
  is_magical: z
    .boolean()
    .optional()
    .default(false)
    .describe('Roadmap 2.8 — dnd5e\'s real feat "properties" enum (mgc). Not "Feature Type" (hardcoded Monster Feature) or "Passive" (dnd5e derives it automatically).'),
  is_trait: z.boolean().optional().default(false).describe('Roadmap 2.8 — dnd5e\'s "trait" feat property.'),
  uses: usesSchema.nullable().optional().describe("Roadmap 2.8."),
  activities: z.array(activitySchema).optional().default([]).describe("Roadmap 2.8 — see activitySchema."),
});

/**
 * Foundry VTT Stage 14 — optional structured spellcasting profile, one per stat
 * block. `ability` is optional (not just its override fields) — a DM may want just
 * the plain-text `description` set before deciding the mechanical details, same as
 * GR's own stat block display and Foundry export already allow.
 */
const spellcastingSchema = z.object({
  ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]).optional(),
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
  caster_level: z
    .number()
    .int()
    .min(1)
    .max(20)
    .nullable()
    .optional()
    .describe("1-20, e.g. the '10' in \"Eryssa is a 10th-level warlock.\" Drives Foundry's automatic spell-slot table."),
});

/**
 * Which of the six ability saving throws are proficient — always present on a
 * statblock (unlike `spellcasting`, never omitted/null), defaulting to all false.
 * Independent of the free-text `saving_throws` line (e.g. "Str +10, Con +9"), which
 * only ever drove GR's own display/static-export; this is what the live Foundry
 * connection actually reads to set `abilities.*.proficient` on the Actor.
 */
const savingThrowProficienciesSchema = z.object({
  str: z.boolean().optional().default(false),
  dex: z.boolean().optional().default(false),
  con: z.boolean().optional().default(false),
  int: z.boolean().optional().default(false),
  wis: z.boolean().optional().default(false),
  cha: z.boolean().optional().default(false),
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
  uses: usesSchema.nullable().optional().describe("Roadmap 2.8 — same limited-uses pool as a feature's, e.g. a wand's charges."),
  activities: z.array(activitySchema).optional().default([]).describe("Roadmap 2.8 — see activitySchema."),
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
  saving_throw_proficiencies: savingThrowProficienciesSchema.optional(),
  spells: z.array(spellSchema).optional().default([]),
  features: z.array(featureSchema).optional().default([]),
  items: z.array(itemSchema).optional().default([]),
});

/**
 * Rich-text formatting reference shared across every body_html/text-shaped field
 * below — GR sanitizes with an HTML allow-list (HTMLPurifier) that happens to
 * preserve everything its own block editor's slash-command menu produces, so
 * writing that exact markup here renders identically to a human using it. See
 * Docs/09-GR-Rich-Text-Formatting.md for the full reference with examples.
 */
const RICH_TEXT_BASIC =
  "Rich text (sanitized HTML). Standard tags render normally: <h1>-<h3>, <p>, " +
  "<ul>/<ol>/<li>, <blockquote>, <table>/<thead>/<tbody>/<tr>/<th>/<td>, <hr>, " +
  '<img src="..."> (must already be hosted elsewhere — this API has no upload ' +
  "endpoint), <a>, <strong>/<em>/<u>/<s>. GR's block editor also has six styled " +
  'callout blocks, usable as plain wrapper divs: <div class="read-aloud">...' +
  "</div> (blue — text to read aloud to players), dm-note (purple — private DM " +
  "reminder), encounter-block (red), treasure-block (gold — rewards/loot), " +
  "boxed-text (neutral bordered box), and dm-secret (red — automatically hidden " +
  "on every public-facing page, safe to always include). A checklist's checkbox " +
  "state does not survive sanitization — use a plain bullet list instead.";

/** RICH_TEXT_BASIC plus the four reference-embed blocks only a section's own body_html expands. */
const RICH_TEXT_SECTION =
  RICH_TEXT_BASIC +
  " Sections additionally support four reference-embed blocks that expand into " +
  'live cards when the section is read or run: <div class="encounter-ref ' +
  'eid-{ID}">Name</div>, class="handout-ref hid-{ID}", class="roll-table-ref ' +
  'rtid-{ID}", and class="quest-ref qid-{ID} qkind-quest" (or qkind-secret) — ' +
  "{ID} must already exist in this same module (create it first with " +
  "gr_create_encounter / gr_create_handout / gr_create_roll_table / " +
  "gr_create_quest_item, then embed it by the id returned). These four only " +
  "expand inside a section's own body_html — used anywhere else they render as " +
  "inert text.";

/** Shorter pointer for secondary rich-text fields — full reference lives on gr_create_section's body_html. */
const RICH_TEXT_NOTE =
  "Rich text (sanitized HTML) — also supports GR's six styled callout blocks " +
  '(<div class="read-aloud">, dm-note, encounter-block, treasure-block, ' +
  "boxed-text, dm-secret); see gr_create_section's body_html field for the full " +
  "formatting reference. A checklist's checkbox state doesn't survive " +
  "sanitization — use a plain bullet list instead.";

/** gr-entry-v1 — custom_fields is a category-specific bag; Realms validates it server-side. */
const entrySchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  body_html: z.string().optional().describe(RICH_TEXT_BASIC),
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
  overview: z.string().optional().describe(RICH_TEXT_BASIC),
  level_range: z.string().optional(),
  party_size: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  visibility: z.enum(["private", "members", "public"]).optional(),
  campaign_id: z.number().int().nullable().optional(),
});

const sectionSchema = z.object({
  type: z.enum(["act", "chapter", "scene", "appendix"]),
  title: z.string().min(1),
  body_html: z.string().nullable().optional().describe(RICH_TEXT_SECTION),
  parent_id: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe(
      "Hierarchy dependency: a chapter's parent_id must point at an act, and a scene's parent_id must " +
        "point at a chapter — GR rejects (422) a chapter with no act parent or a scene with no chapter " +
        "parent. act and appendix have no requirement (both are normally top-level, parent_id omitted or " +
        "null, but neither is enforced to be)."
    ),
});

const handoutSchema = z.object({
  title: z.string().min(1),
  body_html: z.string().nullable().optional().describe(RICH_TEXT_BASIC),
  section_id: z.number().int().nullable().optional(),
  media_id: z.number().int().nullable().optional(),
});

/**
 * A "Related Article" link — module_entry_links on the GR side. Links an
 * existing entry to a module, optionally attributed to a section (in which
 * case it rolls up into the module's own related_articles, same behavior as
 * Handouts/Roll Tables). entry_id is only present here (create), not on
 * update — the link can be re-sectioned/renoted, but not repointed at a
 * different entry; unlink and relink instead.
 */
const relatedArticleCreateSchema = z.object({
  entry_id: z.coerce.number().int().describe("Entry id to link — find one via gr_search_entries."),
  section_id: z.coerce.number().int().nullable().optional().describe("Omit or null for an adventure-level link."),
  context_note: z.string().nullable().optional().describe("Short free-text note, capped at 255 characters."),
});

const relatedArticleUpdateSchema = z.object({
  section_id: z.coerce.number().int().nullable().optional(),
  context_note: z.string().nullable().optional(),
});

const encounterAdversaryInputSchema = z.object({
  entry_id: z.coerce.number().int().describe("Entry id of a creature with a stat block in this world — find one via gr_search_statblocks."),
  quantity: z.coerce.number().int().min(1).optional().describe("Defaults to 1."),
});

const encounterSchema = z.object({
  name: z.string().min(1),
  encounter_type: z.enum(["combat", "social", "exploration", "puzzle", "trap", "other"]).optional(),
  difficulty: z.string().nullable().optional(),
  setup: z.string().nullable().optional().describe(RICH_TEXT_NOTE),
  tactics: z.string().nullable().optional().describe(RICH_TEXT_NOTE),
  rewards: z.string().nullable().optional().describe(RICH_TEXT_NOTE),
  notes: z.string().nullable().optional().describe(RICH_TEXT_NOTE),
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
  description: z.string().nullable().optional().describe(RICH_TEXT_NOTE),
  dm_note: z.string().nullable().optional().describe("DM-only — never shown on the public page."),
});

const rollTableSchema = z.object({
  title: z.string().min(1),
  dm_notes: z.string().nullable().optional(),
  section_id: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Omit or null for an adventure-level table. Ignored when creating/updating a world-level table (no module_id) — those never have a section."),
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
  age_id: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe(
      "Optional in-world date stamp for this session (independent of played_on and the world's " +
        "current-date pointer — logging a session doesn't move \"now\" forward). Must reference a " +
        "calendar age already in this world."
    ),
  year_in_epoch: z.coerce.number().int().nullable().optional().describe("Part of the optional in-world date stamp."),
  month_number: z.coerce.number().int().nullable().optional().describe("Part of the optional in-world date stamp."),
  day: z.coerce.number().int().nullable().optional().describe("Part of the optional in-world date stamp."),
  summary: z.string().nullable().optional().describe(RICH_TEXT_NOTE),
  notes: z.string().nullable().optional().describe(RICH_TEXT_NOTE),
  next_session_prep: z.string().nullable().optional().describe(RICH_TEXT_NOTE),
  player_recap: z
    .string()
    .nullable()
    .optional()
    .describe('The "Last time on…" recap for the next session opening. ' + RICH_TEXT_NOTE),
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

const questItemSchema = z.object({
  kind: z.enum(["quest", "secret"]).optional().describe("Defaults to quest."),
  title: z.string().min(1).describe("Short label shown wherever this item is listed."),
  text: z
    .string()
    .nullable()
    .optional()
    .describe("The full description, shown when the item is opened. " + RICH_TEXT_NOTE),
  entry_id: z.number().int().nullable().optional().describe("Optional linked article — must be an entry in this world (no stat block required)."),
  section_id: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe(
      "Optional linked section — must belong to this module. Ignored for a campaign-scoped item " +
        "(Roadmap 3.7 Phase B) — a section belongs to one module, meaningless at campaign scope."
    ),
  status: z.enum(["unrevealed", "revealed", "resolved"]).optional().describe("Defaults to unrevealed."),
  revealed_session_id: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe(
      "Optional — which session log revealed this item. For a module-scoped item, must belong to that " +
        "module; for a campaign-scoped item, must belong to a session in any of that campaign's adventures."
    ),
});

const playerCharacterImportSchema = z.object({
  source: z
    .string()
    .min(1)
    .describe(
      "A D&D Beyond character page URL (e.g. https://www.dndbeyond.com/characters/12345678) or a bare " +
        "numeric character ID. The character must be shared publicly on D&D Beyond — a private character " +
        "can't be fetched. Importing a D&D Beyond character already imported into this world updates it " +
        "in place instead of creating a duplicate."
    ),
  campaign_id: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe(
      "Optional — attaches this character to a Campaign. That attachment is what lets the campaign's " +
        "adventures use its real linked roster (levels + party size) in their Encounter Difficulty Budget " +
        "instead of a manually-typed level range/party size guess."
    ),
  player_name: z.string().nullable().optional().describe("Optional free-text label for who plays this character — D&D Beyond has no such field."),
  raw_json: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Fallback for when GR's own server (not this MCP client) can't reach D&D Beyond — GR's hosting is " +
        "sometimes blocked by D&D Beyond's Cloudflare bot protection regardless of request headers, and " +
        "gr_import_player_character will fail with an HTTP 403 error when that happens. If it does: fetch " +
        "https://character-service.dndbeyond.com/character/v5/character/{id} yourself (using {id} from " +
        "source, or the id in the failed source URL) and pass its raw response body here verbatim — GR " +
        "will use this instead of fetching it. `source` is still required either way."
    ),
});

const playerCharacterUpdateSchema = z.object({
  player_name: z.string().nullable().optional(),
  notes: z
    .string()
    .nullable()
    .optional()
    .describe("DM notes. " + RICH_TEXT_NOTE + " Preserved across gr_refresh_player_character — never overwritten by a D&D Beyond re-fetch."),
  campaign_id: z.number().int().nullable().optional(),
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

const currentDateSchema = z.object({
  age_id: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Must reference a calendar age already in this world's calendar. Omit to leave unchanged, or null to clear."),
  year_in_epoch: z.coerce.number().int().nullable().optional().describe("Omit to leave unchanged, or null to clear."),
  month_number: z.coerce.number().int().nullable().optional().describe("Omit to leave unchanged, or null to clear."),
  day: z.coerce.number().int().nullable().optional().describe("Omit to leave unchanged, or null to clear."),
});

const historyEventSchema = z.object({
  title: z.string().min(1),
  era_id: z.number().int().nullable().optional().describe("Must reference an era already in this world."),
  age_id: z.number().int().nullable().optional().describe("Must reference a calendar age already in this world."),
  year_in_epoch: z.coerce.number().int().nullable().optional(),
  month_number: z.coerce.number().int().nullable().optional(),
  day: z.coerce.number().int().nullable().optional(),
  body_html: z.string().nullable().optional().describe(RICH_TEXT_NOTE),
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
      "same as posting an empty array) — spellcasting is a true partial update: omit " +
      "it to leave unchanged, or pass null to clear it. saving_throw_proficiencies is " +
      "similar but always whole-object: omit the key to leave all six unchanged, or " +
      "post the object to set exactly those six (any ability missing from it is set " +
      "to false, not left alone).",
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
    description:
      "Fetch a single Geektastic Realms campaign by id — includes its module list and rollup stats " +
      "(Roadmap 3.7 Phase D): section-completion progress, session count, and the most recently played " +
      "session's date, aggregated across every adventure in the campaign.",
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
    name: "gr_list_categories",
    description:
      "List this world's entry categories (NPCs, Factions, Locations, etc.), each with its full custom field " +
      "schema — key, label, type, required, writable, options (select/multiselect), reference_category_id " +
      "(reference). Call this before gr_create_entry/gr_update_entry to know which category_id and " +
      "custom_fields keys are valid.",
    inputSchema: z.object({}),
    async handler(_input, cfg) {
      try {
        return toResult(await client(cfg).listCategories());
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
      "section already in the same module (e.g. a Chapter's parent_id is its Act's section id) — and must " +
      "satisfy the hierarchy dependency: a Chapter needs an Act parent, a Scene needs a Chapter parent " +
      "(see parent_id's own description). body_html supports GR's full rich-text formatting, including " +
      "read-aloud/boxed-text/DM-secret callout blocks and embedded encounter/handout/roll-table/quest " +
      "reference cards — see the body_html field's own description for the exact HTML convention.",
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
    description:
      "Update an existing Act/Chapter/Scene/Appendix section by id. The hierarchy dependency (a Chapter " +
      "needs an Act parent, a Scene needs a Chapter parent — see parent_id's own description) is checked " +
      "against the final type/parent_id combination, so changing just type against an unrelated existing " +
      "parent, or just parent_id against an existing type, is rejected the same as changing both together.",
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
    name: "gr_list_related_articles",
    description:
      "List every Related Article link in a module — both adventure-level and section-attributed, " +
      "in one flat list (adventure-level first). gr_get_module/gr_get_section instead split these into " +
      "module-level vs. per-section stubs matching the outline tree.",
    inputSchema: z.object({ module_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id } = z.object({ module_id: z.coerce.number().int() }).parse(input);
      try {
        return toResult(await client(cfg).listRelatedArticles(module_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_related_article",
    description: "Fetch a single Related Article link by id, with its resolved entry/category/section info.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), link_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id, link_id } = z
        .object({ module_id: z.coerce.number().int(), link_id: z.coerce.number().int() })
        .parse(input);
      try {
        return toResult(await client(cfg).getRelatedArticle(module_id, link_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_related_article",
    description:
      "Link an existing entry to a module as a Related Article — omit section_id for an adventure-level " +
      "link, or attribute it to a section so it rolls up into the module's own related-articles list. " +
      "A module can only link a given entry once — linking one already linked here updates its " +
      "section/note instead of erroring or duplicating it.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), related_article: relatedArticleCreateSchema }),
    async handler(input, cfg) {
      const { module_id, related_article } = z
        .object({ module_id: z.coerce.number().int(), related_article: relatedArticleCreateSchema })
        .parse(input);
      try {
        return toResult(await client(cfg).createRelatedArticle(module_id, related_article));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_related_article",
    description:
      "Update an existing Related Article link's section attribution and/or context note by id. " +
      "The linked entry itself can't be changed here — delete and re-create the link to point at a " +
      "different entry.",
    inputSchema: z.object({
      module_id: z.coerce.number().int(),
      link_id: z.coerce.number().int(),
      related_article: relatedArticleUpdateSchema,
    }),
    async handler(input, cfg) {
      const { module_id, link_id, related_article } = z
        .object({
          module_id: z.coerce.number().int(),
          link_id: z.coerce.number().int(),
          related_article: relatedArticleUpdateSchema,
        })
        .parse(input);
      try {
        return toResult(await client(cfg).updateRelatedArticle(module_id, link_id, related_article));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_delete_related_article",
    description: "Unlink a Related Article by id. The linked entry itself is untouched — only the link is removed.",
    inputSchema: z.object({ module_id: z.coerce.number().int(), link_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id, link_id } = z
        .object({ module_id: z.coerce.number().int(), link_id: z.coerce.number().int() })
        .parse(input);
      try {
        return toResult(await client(cfg).deleteRelatedArticle(module_id, link_id));
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
      "List roll tables (lightweight — id, title, die, row count). Pass module_id to list that module's " +
      "own tables (adventure-level ones have section_id: null); omit module_id to list the world's shared " +
      "roll table library instead — tables built once and embeddable via /rolltable into any module in " +
      "the world. Use gr_get_roll_table to read a specific table's rows.",
    inputSchema: z.object({ module_id: z.coerce.number().int().optional() }),
    async handler(input, cfg) {
      const { module_id } = z.object({ module_id: z.coerce.number().int().optional() }).parse(input);
      try {
        return toResult(
          module_id !== undefined ? await client(cfg).listRollTables(module_id) : await client(cfg).listWorldRollTables()
        );
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_roll_table",
    description:
      "Fetch one roll table's full detail, including every row, by roll table id. Pass module_id for a " +
      "module-scoped table, or omit it to look up a world-level library table instead.",
    inputSchema: z.object({ module_id: z.coerce.number().int().optional(), roll_table_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { module_id, roll_table_id } = z
        .object({ module_id: z.coerce.number().int().optional(), roll_table_id: z.coerce.number().int() })
        .parse(input);
      try {
        return toResult(
          module_id !== undefined
            ? await client(cfg).getRollTable(module_id, roll_table_id)
            : await client(cfg).getWorldRollTable(roll_table_id)
        );
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_roll_table",
    description:
      "Create a roll table — wandering monsters, loot, rumors, etc. Pass module_id to create it inside " +
      "that module (adventure-level by omitting section_id, or attributed to a specific section); omit " +
      "module_id to create it in the world's shared roll table library instead — built once, then " +
      "embeddable via /rolltable into any module in the world. Each row needs at least range_start " +
      "(range_end defaults to range_start); the die size is computed automatically from the highest range_end.",
    inputSchema: z.object({ module_id: z.coerce.number().int().optional(), roll_table: rollTableSchema }),
    async handler(input, cfg) {
      const { module_id, roll_table } = z
        .object({ module_id: z.coerce.number().int().optional(), roll_table: rollTableSchema })
        .parse(input);
      try {
        return toResult(
          module_id !== undefined
            ? await client(cfg).createRollTable(module_id, roll_table)
            : await client(cfg).createWorldRollTable(roll_table)
        );
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_roll_table",
    description:
      "Update an existing roll table by id — pass module_id for a module-scoped table, or omit it to " +
      "update a world-level library table instead. Sending `rows` replaces the entire list — fetch the " +
      "table first (gr_get_roll_table) if you only want to add or edit one row rather than resetting them all.",
    inputSchema: z.object({
      module_id: z.coerce.number().int().optional(),
      roll_table_id: z.coerce.number().int(),
      roll_table: rollTableSchema,
    }),
    async handler(input, cfg) {
      const { module_id, roll_table_id, roll_table } = z
        .object({
          module_id: z.coerce.number().int().optional(),
          roll_table_id: z.coerce.number().int(),
          roll_table: rollTableSchema,
        })
        .parse(input);
      try {
        return toResult(
          module_id !== undefined
            ? await client(cfg).updateRollTable(module_id, roll_table_id, roll_table)
            : await client(cfg).updateWorldRollTable(roll_table_id, roll_table)
        );
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
      "sections_covered, and its optional in-world date stamp (age_id/year_in_epoch/month_number/day) — " +
      "for 'previously on…' continuity.",
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
      "and player recap. xp_awarded/gp_gained store exactly what's sent (0 is a valid awarded amount). " +
      "Optionally stamp when this happened in the campaign calendar via age_id/year_in_epoch/month_number/day.",
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
    name: "gr_list_quest_items",
    description:
      "List every quest/secret item tracked for a module's Quest Log (Roadmap 3.3), or for a campaign's " +
      "cross-module threads instead (Roadmap 3.7 Phase B) — pass module_id for the former, campaign_id " +
      "for the latter. Lightweight, no `text` body. Use gr_get_quest_item to read one item's full " +
      "rich-text description.",
    inputSchema: z.object({ module_id: z.coerce.number().int().optional(), campaign_id: z.coerce.number().int().optional() }),
    async handler(input, cfg) {
      const { module_id, campaign_id } = z
        .object({ module_id: z.coerce.number().int().optional(), campaign_id: z.coerce.number().int().optional() })
        .parse(input);
      try {
        if (module_id !== undefined) {
          return toResult(await client(cfg).listQuestItems(module_id));
        }
        if (campaign_id !== undefined) {
          return toResult(await client(cfg).listCampaignQuestItems(campaign_id));
        }
        throw new Error("Provide either module_id or campaign_id.");
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_quest_item",
    description:
      "Fetch one quest/secret item's full detail — kind, title, rich-text description, status, and any " +
      "linked article/section/revealing session (with resolved titles). Pass module_id for a module-scoped " +
      "item or campaign_id for a campaign-scoped one (Roadmap 3.7 Phase B) — whichever scope the item " +
      "actually belongs to.",
    inputSchema: z.object({
      module_id: z.coerce.number().int().optional(),
      campaign_id: z.coerce.number().int().optional(),
      quest_item_id: z.coerce.number().int(),
    }),
    async handler(input, cfg) {
      const { module_id, campaign_id, quest_item_id } = z
        .object({
          module_id: z.coerce.number().int().optional(),
          campaign_id: z.coerce.number().int().optional(),
          quest_item_id: z.coerce.number().int(),
        })
        .parse(input);
      try {
        if (module_id !== undefined) {
          return toResult(await client(cfg).getQuestItem(module_id, quest_item_id));
        }
        if (campaign_id !== undefined) {
          return toResult(await client(cfg).getCampaignQuestItem(campaign_id, quest_item_id));
        }
        throw new Error("Provide either module_id or campaign_id.");
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_quest_item",
    description:
      "Add a quest or secret/clue to a module's Quest Log, or to a campaign's cross-module threads instead " +
      "(Roadmap 3.7 Phase B) — pass module_id for the former, campaign_id for the latter. A short index " +
      "card for something the party might learn or pursue in any order, not tied to play sequence.",
    inputSchema: z.object({
      module_id: z.coerce.number().int().optional(),
      campaign_id: z.coerce.number().int().optional(),
      quest_item: questItemSchema,
    }),
    async handler(input, cfg) {
      const { module_id, campaign_id, quest_item } = z
        .object({
          module_id: z.coerce.number().int().optional(),
          campaign_id: z.coerce.number().int().optional(),
          quest_item: questItemSchema,
        })
        .parse(input);
      try {
        if (module_id !== undefined) {
          return toResult(await client(cfg).createQuestItem(module_id, quest_item));
        }
        if (campaign_id !== undefined) {
          return toResult(await client(cfg).createCampaignQuestItem(campaign_id, quest_item));
        }
        throw new Error("Provide either module_id or campaign_id.");
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_quest_item",
    description:
      "Update an existing quest/secret item by id — every field optional, only what's sent changes. " +
      "Commonly used to advance status (unrevealed → revealed → resolved) as the party learns or resolves " +
      "it. Pass module_id or campaign_id (Roadmap 3.7 Phase B) matching whichever scope the item belongs to.",
    inputSchema: z.object({
      module_id: z.coerce.number().int().optional(),
      campaign_id: z.coerce.number().int().optional(),
      quest_item_id: z.coerce.number().int(),
      quest_item: questItemSchema,
    }),
    async handler(input, cfg) {
      const { module_id, campaign_id, quest_item_id, quest_item } = z
        .object({
          module_id: z.coerce.number().int().optional(),
          campaign_id: z.coerce.number().int().optional(),
          quest_item_id: z.coerce.number().int(),
          quest_item: questItemSchema,
        })
        .parse(input);
      try {
        if (module_id !== undefined) {
          return toResult(await client(cfg).updateQuestItem(module_id, quest_item_id, quest_item));
        }
        if (campaign_id !== undefined) {
          return toResult(await client(cfg).updateCampaignQuestItem(campaign_id, quest_item_id, quest_item));
        }
        throw new Error("Provide either module_id or campaign_id.");
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_delete_quest_item",
    description:
      "Permanently delete a quest/secret item from the Quest Log (module_id) or a campaign's cross-module " +
      "threads (campaign_id, Roadmap 3.7 Phase B). There is no undo.",
    inputSchema: z.object({
      module_id: z.coerce.number().int().optional(),
      campaign_id: z.coerce.number().int().optional(),
      quest_item_id: z.coerce.number().int(),
    }),
    async handler(input, cfg) {
      const { module_id, campaign_id, quest_item_id } = z
        .object({
          module_id: z.coerce.number().int().optional(),
          campaign_id: z.coerce.number().int().optional(),
          quest_item_id: z.coerce.number().int(),
        })
        .parse(input);
      try {
        if (module_id !== undefined) {
          return toResult(await client(cfg).deleteQuestItem(module_id, quest_item_id));
        }
        if (campaign_id !== undefined) {
          return toResult(await client(cfg).deleteCampaignQuestItem(campaign_id, quest_item_id));
        }
        throw new Error("Provide either module_id or campaign_id.");
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_list_player_characters",
    description:
      "List every Player Character imported into this world from D&D Beyond (Roadmap 3.9) — name, player, " +
      "class/level, and optional Campaign attribution. Lightweight. Use gr_get_player_character for full detail.",
    inputSchema: z.object({}),
    async handler(_input, cfg) {
      try {
        return toResult(await client(cfg).listPlayerCharacters());
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_player_character",
    description:
      "Fetch one Player Character's full detail — ability scores, Armor Class, HP, proficiency bonus, " +
      "passive Perception, background, alignment, DM notes, and its D&D Beyond read-only link.",
    inputSchema: z.object({ player_character_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { player_character_id } = z.object({ player_character_id: z.coerce.number().int() }).parse(input);
      try {
        return toResult(await client(cfg).getPlayerCharacter(player_character_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_import_player_character",
    description:
      "Import a character sheet from D&D Beyond's public character data into this world's Player Characters " +
      "roster — tracking, quick stat reporting, and (once attached to a Campaign) feeding a real party " +
      "roster into that Campaign's adventures' Encounter Difficulty Budget. The character must be shared " +
      "publicly on D&D Beyond. Re-importing an already-imported character updates it in place. If this fails " +
      "with an HTTP 403 error, GR's own server is being blocked by D&D Beyond's bot protection — fetch " +
      "https://character-service.dndbeyond.com/character/v5/character/{id} yourself and retry with the " +
      "raw_json field set instead (see its own description). The character import itself never fails just " +
      "because the portrait couldn't be fetched (a separate, also-possible bot-protection block on D&D " +
      "Beyond's avatar CDN) — check the response's `warning` field (null when the portrait came through " +
      "fine) rather than assuming a successful result means the portrait imported too.",
    inputSchema: z.object({ player_character: playerCharacterImportSchema }),
    async handler(input, cfg) {
      const { player_character } = z.object({ player_character: playerCharacterImportSchema }).parse(input);
      try {
        return toResult(await client(cfg).importPlayerCharacter(player_character));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_player_character",
    description:
      "Update a Player Character's manual-override fields (player_name/notes/campaign_id) by id — every " +
      "field optional, only what's sent changes. Every other field (name, class, ability scores, AC, HP, " +
      "...) is sourced from D&D Beyond and only changes via gr_refresh_player_character, not this tool.",
    inputSchema: z.object({ player_character_id: z.coerce.number().int(), player_character: playerCharacterUpdateSchema }),
    async handler(input, cfg) {
      const { player_character_id, player_character } = z
        .object({ player_character_id: z.coerce.number().int(), player_character: playerCharacterUpdateSchema })
        .parse(input);
      try {
        return toResult(await client(cfg).updatePlayerCharacter(player_character_id, player_character));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_refresh_player_character",
    description:
      "Re-fetch a Player Character from D&D Beyond by id, overwriting every D&D-Beyond-sourced field " +
      "(level, ability scores, AC, HP, ...) while always preserving player_name/notes/campaign_id untouched. " +
      "Use after the player levels up, changes gear, or edits their sheet on D&D Beyond — GR never syncs " +
      "automatically. If this fails with an HTTP 403 error, GR's own server is being blocked by D&D Beyond's " +
      "bot protection — fetch https://character-service.dndbeyond.com/character/v5/character/{id} yourself " +
      "(the same id this Player Character was originally imported from) and retry with raw_json set instead. " +
      "The refresh itself never fails just because the portrait couldn't be re-fetched — check the response's " +
      "`warning` field (null when the portrait came through fine) rather than assuming success means it did.",
    inputSchema: z.object({
      player_character_id: z.coerce.number().int(),
      raw_json: z
        .string()
        .nullable()
        .optional()
        .describe(
          "Fallback for when GR's own server can't reach D&D Beyond — see gr_import_player_character's " +
            "raw_json field for the full explanation. Pass the character-service response here instead of " +
            "letting GR re-fetch it."
        ),
    }),
    async handler(input, cfg) {
      const { player_character_id, raw_json } = z
        .object({
          player_character_id: z.coerce.number().int(),
          raw_json: z.string().nullable().optional(),
        })
        .parse(input);
      try {
        return toResult(await client(cfg).refreshPlayerCharacter(player_character_id, raw_json ?? undefined));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_delete_player_character",
    description: "Remove a Player Character from this world's roster by id (does not affect the character on D&D Beyond). There is no undo.",
    inputSchema: z.object({ player_character_id: z.coerce.number().int() }),
    async handler(input, cfg) {
      const { player_character_id } = z.object({ player_character_id: z.coerce.number().int() }).parse(input);
      try {
        return toResult(await client(cfg).deletePlayerCharacter(player_character_id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_current_date",
    description:
      "Fetch this world's current in-world date (Roadmap 3.6) — a pointer to \"now\" in the campaign " +
      "calendar, set from the web app's Calendar page, not a log entry. `current_date` is null if the " +
      "world has no calendar, or has one but hasn't set a current date yet. Use this to date newly-" +
      "generated journal-style content (session recaps, history events) correctly. Requires `history` scope.",
    inputSchema: z.object({}),
    async handler(_input, cfg) {
      try {
        return toResult(await client(cfg).getCurrentDate());
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_set_current_date",
    description:
      "Set this world's current in-world date — overwrites the existing pointer, it does not append a " +
      "log entry (for that, use gr_create_session's or gr_create_event's own date fields instead). Every " +
      "field is optional: omit a field to leave it unchanged, or send it as null to clear it. Fails with " +
      "422 if this world has no calendar set up yet (create one from the web app's Calendar page first).",
    inputSchema: z.object({ current_date: currentDateSchema }),
    async handler(input, cfg) {
      const { current_date } = z.object({ current_date: currentDateSchema }).parse(input);
      try {
        return toResult(await client(cfg).setCurrentDate(current_date));
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
  getPrompts(_cfg) {
    return [...getGeektasticPrompts(), ...getCampaignBuilderPrompts()];
  },
};
