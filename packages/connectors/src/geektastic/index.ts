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
  features: z.array(featureSchema).optional().default([]),
  items: z.array(itemSchema).optional().default([]),
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
      "features/items arrays with what's posted.",
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
