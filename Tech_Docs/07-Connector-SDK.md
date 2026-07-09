# Connector SDK

`packages/connectors` defines the abstraction that lets this server expose
tools from more than one backend application, and ships the one connector
that currently exists: Geektastic Realms.

## The `AppConnector` interface (`src/types.ts`)

```ts
export type ConnectorConfig = Record<string, unknown>;

export interface HealthCheckResult {
  ok: boolean;
  detail?: string;
}

export interface ToolDefinition {
  name: string;                 // globally unique, namespaced, e.g. "gr_search_statblocks"
  description: string;
  inputSchema: ZodType;
  handler(input: unknown, cfg: ConnectorConfig): Promise<ToolResult>;
}

export interface AppConnector {
  id: string;                    // stable id, stored as app_connections.appType
  displayName: string;
  configSchema: ZodType;          // validates the connection form's fields (baseUrl, credentials, ...)
  healthCheck(cfg: ConnectorConfig): Promise<HealthCheckResult>;
  getTools(cfg: ConnectorConfig): ToolDefinition[];
}
```

`ConnectorConfig` is the **decrypted** config for one connection row: `{
baseUrl, ...credentials }` (see `connections/service.ts`'s
`loadActiveConnections()`). `getTools(cfg)` receives this so a connector could
in principle vary its tool set per-connection (the Geektastic Realms connector
doesn't — it always returns the same static list).

## The registry (`src/registry.ts`)

```ts
const CONNECTORS: AppConnector[] = [geektasticRealmsConnector];
```

`getConnector(appType)` / `listConnectors()` — a flat, hardcoded array.
`aggregateTools(connections: ActiveConnection[])` is the shared function used
by both `/mcp` (`mcp/server.ts`) and the Testing Playground
(`api/playground.routes.ts`) to flatten every enabled connection's enabled
tools into one list — this is what guarantees the playground and real MCP
clients see identical tool sets and get identical results.

## Adding a new connector

1. Create `packages/connectors/src/<app>/` with (at minimum) an `index.ts`
   exporting an `AppConnector`, following the pattern in
   `src/geektastic/index.ts` (a `client.ts` for the REST client is a
   convention, not a requirement of the interface).
2. Register it in `CONNECTORS` in `src/registry.ts`.
3. Nothing else changes — the Web UI's Connections/Tools pages, token auth,
   tool-call logging, and the `/mcp` endpoint all work automatically once a
   connector is registered, because they only ever go through
   `getConnector()`/`listConnectors()`/`aggregateTools()`.

A connector's `configSchema` drives what the Web UI's "Add connection" form
needs — today the UI only special-cases `geektastic-realms` with a dedicated
Base URL + API key form (`apps/web/src/pages/Connections.tsx`); any other
`appType` falls back to a raw JSON textarea for `config`. A more polished UI
would render fields from `configSchema` generically, but that isn't built yet.

## The Geektastic Realms connector

`id: "geektastic-realms"`. Talks to Geektastic Realms' `/api/v1/*`
"General-Purpose API" (documented in that project's `Docs/API.md`) via
`GeektasticRealmsClient` (`src/geektastic/client.ts`).

### Config (`configSchema`)

```ts
{ baseUrl: string (url), apiKey: string (min 1) }  // apiKey prefixed grapi_
```

`parseConfig()` strips a trailing slash from `baseUrl` and throws if either
field is empty. `GeektasticRealmsClient.request()` always prefixes
`/api/v1` itself, sends `Authorization: Bearer <apiKey>`, and on a non-2xx
response tries to parse GR's `{ ok: false, error: "..." }` body for a clean
message, falling back to raw response text (truncated to 500 chars) or the
HTTP status text.

### `healthCheck`

Calls `GET /api/v1/ping`. On success, returns `{ ok: true, detail: "<world
name> (Realms v<version>)" }`; on failure, `{ ok: false, detail:
"<error message>" }`.

### Tool catalog (22 tools)

All handlers follow the same shape: parse `input` with the tool's own Zod
schema, call the matching `GeektasticRealmsClient` method, wrap the result
with `toResult()` (JSON-stringify into one text content block) or catch and
return `toErrorResult()` (the error message as an `isError: true` result —
never a thrown exception past the handler boundary).

| Tool | Input schema (key fields) | Client method |
|---|---|---|
| `gr_search_statblocks` | `{ query? }` | `searchStatblocks` |
| `gr_get_statblock` | `{ entry_id: coerced int }` | `getStatblock` |
| `gr_create_statblock` | `{ category_id: int, statblock }` | `createStatblock` |
| `gr_update_statblock` | `{ entry_id: coerced int, statblock }` | `updateStatblock` |
| `gr_list_campaigns` | `{}` | `listCampaigns` |
| `gr_get_campaign` | `{ id: coerced int }` | `getCampaign` |
| `gr_search_entries` | `{ category_id?: coerced int, query? }` | `searchEntries` |
| `gr_get_entry` | `{ entry_id: coerced int }` | `getEntry` |
| `gr_create_entry` | `{ category_id: coerced int, entry }` | `createEntry` |
| `gr_update_entry` | `{ entry_id: coerced int, entry }` | `updateEntry` |
| `gr_list_modules` | `{}` | `listModules` |
| `gr_get_module` | `{ module_id: coerced int }` | `getModule` |
| `gr_create_module` | `{ module }` | `createModule` |
| `gr_update_module` | `{ module_id: coerced int, module }` | `updateModule` |
| `gr_search_sections` | `{ query?, type?: act\|chapter\|scene\|appendix }` | `searchSections` |
| `gr_get_section` | `{ module_id, section_id: coerced int }` | `getSection` |
| `gr_create_section` | `{ module_id: coerced int, section }` | `createSection` |
| `gr_update_section` | `{ module_id, section_id: coerced int, section }` | `updateSection` |
| `gr_create_handout` | `{ module_id: coerced int, handout }` | `createHandout` |
| `gr_update_handout` | `{ module_id, handout_id: coerced int, handout }` | `updateHandout` |
| `gr_create_encounter` | `{ module_id, section_id: coerced int, encounter }` | `createEncounter` |
| `gr_update_encounter` | `{ module_id, encounter_id: coerced int, encounter }` | `updateEncounter` |

`entry_id`/`category_id`/id-shaped fields consistently use `z.coerce.number()`
so an MCP client passing either a JSON number or a numeric string both work
(model output sometimes stringifies numbers).

### The `gr-statblock-v1` shape

```ts
{
  name, size: Tiny|Small|Medium|Large|Huge|Gargantuan, type, subtype?,
  alignment?, armor_class, ac_note?, hit_points, hit_dice?, speed?,
  abilities: { str, dex, con, int, wis, cha },     // all int
  saving_throws?, skills?, senses?, languages?,
  damage_vulnerabilities?, damage_resistances?, damage_immunities?,
  condition_immunities?, challenge_rating, xp?, proficiency_bonus?,
  features: [{ type: trait|spellcasting|action|bonus_action|reaction|
                    legendary_action|lair_action|regional_effect,
               name, description? }],
  items: [{ name, category: trinket|weapon|armor|magic_item|ammunition|
                             tool|gear|currency,
            quantity?, weight?, value_amount?, value_unit?: gp|sp|cp|ep|pp,
            properties?, requires_attunement?, attunement_description?, notes? }]
}
```

`gr_update_statblock` replaces `features`/`items` wholesale — there's no
merge/patch semantics for these arrays.

### `gr-entry-v1` and `custom_fields`

```ts
{ title, summary?, body_html?, status?: draft|published|archived,
  visibility?: private|members|public, parent_id?: int|null, tags?: string[],
  custom_fields?: Record<string, unknown> }
```

`custom_fields` is deliberately a loose `z.record(z.string(), z.unknown())` —
each Geektastic Realms *category* defines its own field set at runtime, so
the connector can't know the shape ahead of time; Realms validates the actual
values server-side. Keys are each field's stable string key, not a numeric
field id. Image/gallery/map fields are read-only through this API (not
settable via `custom_fields`).

### Modules, sections, handouts, encounters

- `gr-module-v1`'s own fields (`title, summary?, overview?, level_range?,
  party_size?, status?, visibility?, campaign_id?`) are separate from its
  section tree — sections are created/read independently
  (`gr_create_section` / `gr_get_section` / `gr_search_sections`), not nested
  inside the module payload.
- `gr_get_module` intentionally returns a **lightweight outline** (no
  `body_html`; encounters/handouts as name-only stubs) — see
  `CHANGELOG.md` 1.0.4: a full module's text can be hundreds of KB, large
  enough to exceed tool-response size limits outright. `gr_get_section`
  exists specifically to fetch one section's real content on demand.
- `encounterSchema.adversaries` (`{ entry_id: coerced int, quantity?:
  coerced int, min 1, defaults to 1 }[]`) — sending this field on
  `gr_create_encounter`/`gr_update_encounter` **replaces the entire
  adversaries list**, not a diff/append (see `CHANGELOG.md` 1.0.5). Every
  encounter returned by create/update/`gr_get_section` includes a *resolved*
  `adversaries` array (`{ entry_id, name, category, quantity }`) — names and
  categories are joined server-side (on the Geektastic Realms side) from
  each `entry_id`.

### Not yet exposed

Roll Tables exist in Geektastic Realms but have no corresponding tools yet —
tracked as an open item in `ROADMAP.md`.
