import { z } from "zod";
import type { AppConnector, ConnectorConfig, HealthCheckResult, ToolDefinition } from "../types.js";
import { GeektasticRealmsClient, parseConfig } from "./client.js";

/**
 * Connector for Geektastic Realms. Endpoint paths in client.ts are placeholders
 * pending the real GR OpenAPI spec — see ROADMAP.md "Open Item". Update
 * client.ts and the tool list below once the spec is available; the
 * AppConnector contract (this file) should not need to change.
 */

const configSchema = z.object({
  baseUrl: z.string().url().describe("Base URL of the Geektastic Realms API, e.g. https://realms.example.com/api"),
  apiKey: z.string().min(1).describe("API key or bearer token for Geektastic Realms"),
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
    description: "Search Geektastic Realms statblocks by name or keyword.",
    inputSchema: z.object({ query: z.string().min(1) }),
    async handler(input, cfg) {
      const { query } = z.object({ query: z.string().min(1) }).parse(input);
      try {
        return toResult(await client(cfg).searchStatblocks(query));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_get_statblock",
    description: "Fetch a single Geektastic Realms statblock by id.",
    inputSchema: z.object({ id: z.string().min(1) }),
    async handler(input, cfg) {
      const { id } = z.object({ id: z.string().min(1) }).parse(input);
      try {
        return toResult(await client(cfg).getStatblock(id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_create_statblock",
    description: "Create a new statblock in Geektastic Realms (gr-statblock-v1 format).",
    inputSchema: z.object({ statblock: z.record(z.string(), z.unknown()) }),
    async handler(input, cfg) {
      const { statblock } = z.object({ statblock: z.record(z.string(), z.unknown()) }).parse(input);
      try {
        return toResult(await client(cfg).createStatblock(statblock));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  },
  {
    name: "gr_update_statblock",
    description: "Update an existing Geektastic Realms statblock by id.",
    inputSchema: z.object({ id: z.string().min(1), statblock: z.record(z.string(), z.unknown()) }),
    async handler(input, cfg) {
      const { id, statblock } = z
        .object({ id: z.string().min(1), statblock: z.record(z.string(), z.unknown()) })
        .parse(input);
      try {
        return toResult(await client(cfg).updateStatblock(id, statblock));
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
    inputSchema: z.object({ id: z.string().min(1) }),
    async handler(input, cfg) {
      const { id } = z.object({ id: z.string().min(1) }).parse(input);
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
      await client(cfg).ping();
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },
  getTools(_cfg) {
    return tools;
  },
};
