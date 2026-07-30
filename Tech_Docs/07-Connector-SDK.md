# Connector SDK

`packages/connectors` defines the abstraction that lets this server expose
tools and prompts from more than one backend application. Two connectors
exist today: **Geektastic Realms** (`src/geektastic/`) and **Geektastic
Family Tree** (`src/family-tree/`) — this doc focuses on the former, which
has both tools and (as of Phase 8) prompts; Family Tree contributes tools
only.

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

export interface PromptArgumentDefinition {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptMessage {
  role: "user" | "assistant";
  text: string;                 // text-only content — sufficient for every prompt built so far
}

export interface PromptResult {
  description?: string;
  messages: PromptMessage[];
}

export interface PromptDefinition {
  name: string;                 // globally unique, namespaced, e.g. "gr_session_prep"
  description: string;
  arguments?: PromptArgumentDefinition[];
  // Prompt arguments are always plain strings on the wire (unlike a tool's
  // arbitrary-JSON input) — handlers parse/coerce internally as needed.
  handler(args: Record<string, string>, cfg: ConnectorConfig): Promise<PromptResult>;
}

export interface AppConnector {
  id: string;                    // stable id, stored as app_connections.appType
  displayName: string;
  configSchema: ZodType;          // validates the connection form's fields (baseUrl, credentials, ...)
  healthCheck(cfg: ConnectorConfig): Promise<HealthCheckResult>;
  getTools(cfg: ConnectorConfig): ToolDefinition[];
  getPrompts?(cfg: ConnectorConfig): PromptDefinition[]; // optional — not every connector needs prompts
}
```

`ConnectorConfig` is the **decrypted** config for one connection row: `{
baseUrl, ...credentials }` (see `connections/service.ts`'s
`loadActiveConnections()`). `getTools(cfg)`/`getPrompts(cfg)` receive this so
a connector could in principle vary its tool/prompt set per-connection
(neither connector does today — both always return the same static list).

## The registry (`src/registry.ts`)

```ts
const CONNECTORS: AppConnector[] = [geektasticRealmsConnector, familyTreeConnector];
```

`getConnector(appType)` / `listConnectors()` — a flat, hardcoded array.
`aggregateTools(connections: ActiveConnection[])` and
`aggregatePrompts(connections: ActiveConnection[])` are the shared functions
used by both `/mcp` (`mcp/server.ts`) and the Testing Playground
(`api/playground.routes.ts`) to flatten every enabled connection's enabled
tools/prompts into one list — this is what guarantees the playground and real
MCP clients see identical tool/prompt sets and get identical results.
`aggregatePrompts` skips any connector without a `getPrompts` method, and
dedupes by name first-wins if two active connections both contribute a
same-named prompt (e.g. two `geektastic-realms` connections) — mirroring
`aggregateTools`' existing behavior for the same latent multi-connection
collision case.

## Adding a new connector

1. Create `packages/connectors/src/<app>/` with (at minimum) an `index.ts`
   exporting an `AppConnector`, following the pattern in
   `src/geektastic/index.ts` (a `client.ts` for the REST client is a
   convention, not a requirement of the interface). Implement `getPrompts`
   too if the app has DM/user-facing workflows worth templating — it's
   optional, so a tools-only connector like `family-tree` can skip it.
2. Register it in `CONNECTORS` in `src/registry.ts`.
3. Nothing else changes — the Web UI's Connections/Tools/Prompts pages, token
   auth, tool/prompt-call logging, and the `/mcp` endpoint all work
   automatically once a connector is registered, because they only ever go
   through `getConnector()`/`listConnectors()`/`aggregateTools()`/
   `aggregatePrompts()`.

A connector's `configSchema` drives what the Web UI's "Add connection" form
needs — `apps/web/src/pages/Connections.tsx` special-cases known connectors
(`geektastic-realms`, `family-tree`) with a dedicated Base URL + API key form;
any other `appType` falls back to a raw JSON textarea for `config`. A more
polished UI would render fields from `configSchema` generically, but that
isn't built yet.

## Response-size discipline

Any list/detail tool **or prompt handler** must have a bounded worst case.
This mattered for tools from early on (`gr_get_module` returning a full
module's text could exceed hundreds of KB — see `CHANGELOG.md` 1.0.4, fixed
by splitting it into a lightweight outline plus `gr_get_section` for one
section's full content at a time). It matters *more* for prompt handlers,
since a prompt handler does its own data-fetching up front rather than
returning one caller-requested object like a tool does — a naive prompt that
walks "the whole module" or "every session ever logged" has a much sharper
unbounded-fan-out risk. `gr_session_prep` (see below) is the reference
pattern: it fetches the lightweight module outline, the *single* most recent
session log, and only the next 1-2 sections still needed — never the whole
remaining module.

The Campaign Builder prompts (`src/geektastic/campaign/`, see below) are a
deliberate exception worth calling out explicitly: their response text is large
(each embeds a full instructional template verbatim) but **fixed**, not
data-driven — the same size every call regardless of world size or history
length. That's a different kind of "bounded" than the data-fetching prompts
above, not a violation of this rule.

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

### Tool catalog

All handlers follow the same shape: parse `input` with the tool's own Zod
schema, call the matching `GeektasticRealmsClient` method, wrap the result
with `toResult()` (JSON-stringify into one text content block) or catch and
return `toErrorResult()` (the error message as an `isError: true` result —
never a thrown exception past the handler boundary). The table below has
grown incrementally and isn't exhaustive (roll tables, session logs, quest
items, world history, current-date, and deletes all followed later, each
in the same style) — see
[Docs/05-GR-Tools-Reference.md](../Docs/05-GR-Tools-Reference.md) for the
complete, currently-accurate tool list.

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
| `gr_list_related_articles` | `{ module_id: coerced int }` | `listRelatedArticles` |
| `gr_get_related_article` | `{ module_id, link_id: coerced int }` | `getRelatedArticle` |
| `gr_create_related_article` | `{ module_id: coerced int, related_article }` | `createRelatedArticle` |
| `gr_update_related_article` | `{ module_id, link_id: coerced int, related_article }` | `updateRelatedArticle` |
| `gr_delete_related_article` | `{ module_id, link_id: coerced int }` | `deleteRelatedArticle` |
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
- **Related Articles** (`gr_*_related_article*`) are links (`module_entry_links`
  on the GR side) between an existing entry and a module, optionally
  attributed to one section. `entry_id` is only accepted on
  `gr_create_related_article` — the link's section/note can be updated via
  `gr_update_related_article`, but not which entry it points at (delete +
  recreate instead). GR's API treats a repeat `gr_create_related_article` for
  an entry already linked to that module as an update (moves/renotes the
  existing link) rather than an error or a duplicate — the underlying
  `module_entry_links` table has a `UNIQUE (module_id, entry_id)` constraint.
  Section-attributed links roll up into `gr_get_module`'s top-level
  `related_articles` stubs and `gr_list_related_articles`' flat list, exactly
  like Handouts/Roll Tables already do — this was the first tool addition
  built directly against a Geektastic Realms feature that pre-dated any
  general-purpose API exposure (previously web-app-only via
  `App\Models\ModuleEntryLink`).

### Not yet exposed

Roll Tables exist in Geektastic Realms but have no corresponding tools yet —
tracked as an open item in `ROADMAP.md`.

## Prompts (`src/geektastic/prompts.ts`)

`getGeektasticPrompts(): PromptDefinition[]` — wired into
`geektasticRealmsConnector.getPrompts` in `geektastic/index.ts`. Unlike the
tool handlers (which take arbitrary input and return one specific thing),
each prompt handler **actively fetches bounded context** via the same
`GeektasticRealmsClient` the tools use, embeds it in a single seeded `user`
message, and hands the model a concrete task — see [MCP
Protocol → Prompts](04-MCP-Protocol.md#prompts) for how these get registered
on the wire.

| Prompt | Arguments | What the handler fetches |
|---|---|---|
| `gr_session_prep` | `module_id` (required) | `getModule` (outline) + `listSessions`/`getSession` (most recent log). Instructs the model to call `gr_get_section` itself on the next 1-2 uncovered sections (per `sections_covered`) before drafting the prep sheet — the handler doesn't walk the outline tree itself, deliberately, to stay bounded and avoid depending on an unconfirmed nested-JSON shape. |
| `gr_recap_writer` | `session_notes` (required), `module_id` (optional) | If `module_id` given: `listSessions`/`getSession` for the previous `player_recap`/`summary`, for continuity. |
| `gr_statblock_from_description` | `description` (required), `challenge_rating` (optional) | No fetch — the tool's own input schema already conveys the JSON shape via `tools/list`; this prompt's value-add is CR-to-stat-block design guidance in the message text. |
| `gr_populate_encounter` | `module_id`, `section_id`, `cr_budget` (required), `theme` (optional) | `searchStatblocks(theme)` — already capped by the tool's own existing 100-result behavior, no separate cap needed. |

Each handler validates required args itself (`requireArg`/`requireIntArg` in
`prompts.ts`) and throws a clear `Error` on a missing/invalid one — since
`GetPromptResult` has no `isError` convention (unlike `ToolResult`), a thrown
error is the correct way to signal failure; `mcp/server.ts`'s prompt wrapper
logs it to `PromptCallLog` and then rethrows, letting the SDK surface a
JSON-RPC error to the client rather than a "successful" prompt with an error
baked into its text.

## Campaign Builder prompts (`src/geektastic/campaign/`)

Six more prompts, converted from the `dm-campaign-builder` Claude Code skill's
six modes (`D:\github\dm-toolkit\dm-campaign-builder\SKILL.md`) — see
`ROADMAP.md` Phase 8 "Campaign Builder prompts". `getCampaignBuilderPrompts():
PromptDefinition[]` (`campaign/index.ts`) is spread into
`geektasticRealmsConnector.getPrompts` alongside `getGeektasticPrompts()` in
`geektastic/index.ts`, rather than living on a new connector — these prompts
never call `GeektasticRealmsClient` at all, but the current architecture has
no connector-less prompt path, and bundling them here means using them needs
no extra field-less "connection" in the dashboard.

One file per mode, each exporting a single `PromptDefinition`; a shared
`helpers.ts` provides `requireArg`/`optionalArg`/`renderInputs`/`userMessage`
(small local re-implementations of the same-shaped helpers in `../prompts.ts`,
which doesn't export them). Every handler's message is built the same way:
a `# User-Supplied Inputs` block from whichever arguments were actually given
(blank optional ones are omitted, matching the source skill's own "optional
fields never block progress" rule), followed by that mode's entire generation
or review specification transcribed verbatim from `SKILL.md` — no summarizing.
The three Builder modes additionally append a `Campaign World Integration`
block, but only when a world-details argument was supplied, mirroring the
skill's own conditional-activation logic.

| Prompt | Arguments | What the handler fetches |
|---|---|---|
| `campaign_arc_builder` | `campaign_setting`, `party_level_range`, `session_count`, `tone` (required); `world_details`, `central_conflict`, `pc_hooks` (optional) | Nothing — static instructional template, argument values interpolated in. |
| `campaign_arc_reviewer` | `arc_document` (required); `party_level_range`, `session_count`, `world_details` (optional) | Nothing. |
| `campaign_faction_builder` | `faction_type`, `power_level`, `location`, `relationship_to_players` (required); `faction_name`, `existing_factions`, `world_details` (optional) | Nothing. `world_details` isn't in the source skill's own input table for this mode, but its Campaign World Integration section clearly expects one — added here so that section has something to trigger on, consistent with the other two Builder modes. |
| `campaign_faction_reviewer` | `faction_document` (required); `other_factions`, `world_details` (optional) | Nothing. |
| `campaign_module_builder` | `campaign_setting`, `party_level`, `party_size`, `module_length`, `tone` (required); `module_title`, `world_details`, `primary_villain`, `hook_preference`, `pc_connections` (optional) | Nothing. |
| `campaign_module_reviewer` | `module_document` (required); `party_level`, `party_size`, `world_details` (optional) | Nothing. Includes the source skill's villain-offer workflow verbatim (offers to build a villain if none is identifiable in the supplied module, referencing `campaign_module_builder`'s own Villain section format). |
