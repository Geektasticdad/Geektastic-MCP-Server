# Geektastic MCP Server — Completed Roadmap Items

Fully shipped delivery-phase work, moved out of [ROADMAP.md](ROADMAP.md) to keep that
file focused on what's still open. See ROADMAP.md's "Delivery Phases" intro for the
running summary of where things stand, and "Delivery Phases — what's next" for
forward work.

---

### Phase 1 — Scaffold & infrastructure
- [x] pnpm monorepo (`apps/server`, `apps/web`, `packages/connectors`, `packages/shared`)
- [x] Dockerfile (multi-stage) + docker-compose (app + Postgres) + `.env.example`
- [x] Prisma schema; startup runs `prisma db push` (no migration history yet — see README)
- [x] `/health` endpoint
- [x] **Verify:** `docker compose up` → health green; Postgres persists on restart

### Phase 2 — Auth, users & connections
- [x] Session login, bcrypt passwords, CSRF; bootstrap admin from env
- [x] Roles (admin/member) + `requireAuth` / `requireAdmin` middleware
- [x] User management (admin creates accounts, roles, disable/enable, reset password, `mustChangePassword`)
- [x] Connections CRUD + AES-256-GCM secret encryption + GR "test connection"

### Phase 3 — Connector layer
- [x] `AppConnector` / `ToolDefinition` interfaces + registry
- [x] Geektastic Realms connector implemented against the real `/api/v1/*` endpoints
      and `gr-statblock-v1` schema (see `packages/connectors/src/geektastic/client.ts`
      and Docs/API.md in the geektastic-realms repo)
- [x] `healthCheck` for dashboard status

### Phase 4 — MCP endpoint
- [x] Streamable HTTP `/mcp` via MCP SDK
- [x] Bearer-token auth middleware (hashed tokens, `lastUsedAt`, revoke, rate limit)
- [x] Tool aggregation from enabled connectors + per-tool enable/disable
- [x] Tool-call logging to DB

### Phase 5 — Web UI
- [x] Dashboard, Connections, Tools toggles, Tokens
- [x] Testing Playground (reuses real handlers)
- [x] Logs
- [x] Users (admin) + Profile/password; role-based hiding of admin controls

### Phase 6 — Harden & document
- [x] Rate limiting (login + `/mcp`), CSRF (double-submit token)
- [x] Full security review of secret handling; adopt tracked Prisma migrations —
      carried forward into Phase 9 (Engineering hardening) in ROADMAP.md, where it
      remains open.
- [x] README: Portainer deploy steps + `claude mcp add` client setup
- [x] `.env.example` finalized

---

### Phase 7 — GR tool coverage: close the content loop ✅ shipped (v1.2.0)

Tracked GR's "Priority 1" API work so no prep content type is invisible to Claude —
all six items shipped in one pass; total GR tool count 22 → 46. See
[CHANGELOG.md](CHANGELOG.md) and
[Docs/05-GR-Tools-Reference.md](Docs/05-GR-Tools-Reference.md).

- [x] **Roll Tables** — `gr_list_roll_tables` / `gr_get_roll_table` /
      `gr_create_roll_table` / `gr_update_roll_table` (rows included; the single most
      generative-AI-friendly content type — wandering monsters, loot, rumors).
      Lightweight list + full-detail-by-id, same split as sections. **v1.3.4**: all
      four also work at the world level — omit `module_id` to list/create/read/update
      a table in the world's shared roll table library instead of inside one module
      (GR v1.34.2, Roadmap 3.4).
- [x] **Campaign writes** — `gr_create_campaign` / `gr_update_campaign`.
- [x] **Individual reads** — `gr_get_encounter` / `gr_get_handout` — fetch one by id
      without pulling the whole section.
- [x] **Session logs** — `gr_list_sessions` / `gr_get_session` / `gr_create_session` /
      `gr_update_session`: "here are my messy notes, write the recap and next-session
      prep" is a marquee MCP use case, and reads give Claude campaign continuity.
      **v1.4.2**: gained an optional in-world date stamp (`age_id`/`year_in_epoch`/
      `month_number`/`day`, GR v1.35.0, Roadmap 3.6) — independent of `played_on`
      and of the world's current-date pointer.
- [x] **Quest Log** — `gr_list_quest_items` / `gr_get_quest_item` / `gr_create_quest_item`
      / `gr_update_quest_item` / `gr_delete_quest_item` (GR v1.35.4, Roadmap 3.3): short
      index-card **quests** and **secrets/clues** for a module, each with a title,
      rich-text description, status, and optional links to an entry/section/revealing
      session. Unlike session logs and roll tables, this one **does** get a delete
      tool — quest items are disposable index cards, and the GR API exposes a matching
      `DELETE` endpoint.
- [x] **World history** — era/event tools so worldbuilding chats can file timeline
      events as they invent them. Gated by GR's `history` resource scope — a
      connection's token needs that scope granted (in addition to
      `entries`/`modules`/`campaigns`/`foundry`) before these tools return anything
      but a 403. **v1.4.2**: `gr_get_current_date` / `gr_set_current_date` join this
      scope — the world's current in-world date (a pointer, not a log entry), so a
      client can date newly-generated journal-style content correctly.
- [x] **Deletes** — `gr_delete_entry` / `gr_delete_section` / `gr_delete_encounter` /
      `gr_delete_handout`. Gated behind the existing per-tool disable so an admin can
      run a no-delete server; all four are irreversible (no undo on the GR side).
      Deletes for campaigns/roll tables/session logs remain unavailable — GR doesn't
      expose those `DELETE` endpoints yet.
- [x] **Related Articles** — `gr_list_related_articles` / `gr_get_related_article` /
      `gr_create_related_article` / `gr_update_related_article` /
      `gr_delete_related_article`: link an existing entry to a module, optionally
      attributed to a section — the GR web app's "Related Articles" feature
      (`module_entry_links`), previously web-app-only. Required a new
      general-purpose API surface on the GR side (`Api\RelatedArticleController`)
      built alongside this connector work. Section-attributed links roll up into
      the module's own list and `gr_get_module`'s outline, same "roll up to the
      adventure-level panel" behavior the web app already has — not a new rollup
      design, just exposed via the general-purpose API for the first time.

#### Phase 7.1 — Structured spellcasting field coverage ✅ shipped (v1.3.0, `description` field in v1.3.1, `caster_level`/`saving_throw_proficiencies` in v1.3.3)

GR's Foundry VTT integration Stage 14 added an optional structured spellcasting
profile + spell list to stat blocks (`geektastic-realms` v1.25.0–v1.26.0), but only
on the Foundry-only `npc/prepare` endpoint at first — the general-purpose
`/api/v1/statblocks` equivalent this connector actually talks to didn't exist until
GR v1.27.0. Once it did, `statblockSchema` picked up the same `spellcasting`
(ability/save DC/attack override) and `spells[]` (name/level/`usage_type`
`slot`/`pact`/`at_will`/`per_day`/`uses_per_day`) fields, so `gr_create_statblock`/
`gr_update_statblock`/`gr_get_statblock` can now round-trip them — no new tools
needed, existing statblock tools just gained fields. GR v1.28.0 added a plain-text
`description` alongside `spellcasting` (a spellcasting summary paragraph, rendered on
GR's own stat block display); `spellcastingSchema` picked that up too. GR v1.29.0
added `spellcasting.caster_level` (1-20) and a top-level `saving_throw_proficiencies`
(six booleans, always present, independent of the free-text `saving_throws` line) —
both picked up here the same way. See
[Docs/05-GR-Tools-Reference.md](Docs/05-GR-Tools-Reference.md) "Stat blocks".

#### Phase 7.2 — Structured Activities & Feature Details field coverage ✅ shipped (v1.4.4)

GR Roadmap 2.8 added an optional structured Activities layer (Attack/Check/Damage/
Heal/Save) and Feature Details (required level, repeatable, Magical/Trait
properties, usage limits) to stat block features and items, threaded through
`/api/v1/statblocks` alongside the existing structured-spellcasting fields (Phase
7.1's model). No new tools needed — `featureSchema`/`itemSchema` (used by
`gr_create_statblock`/`gr_update_statblock`/`gr_get_statblock`) just gained
fields, same pattern as 7.1:

- [x] `featureSchema` gained `level`, `repeatable`, `is_magical`/`is_trait`, and
      `uses` (`{max, recovery_period}`).
- [x] `featureSchema`/`itemSchema` both gained `activities[]` — each entry has
      `activity_type` (`attack`/`check`/`damage`/`heal`/`save` — **no `cast`**:
      corrected from this section's original draft once GR actually shipped, since
      GR's own `stat_block_activities.activity_type` enum deliberately excludes it
      — Cast activities are generated entirely on the Foundry Connect module side
      from the stat block's own `spells[]` list, never sent by a client), plus
      activation/range/target and type-specific fields (`attack_bonus`/
      `attack_type` for Attack, `save_ability`/`save_dc`/`save_effect` for Save,
      `check_skill_or_tool`/`check_dc` for Check).
- [x] **`damage_parts[]` (not a single formula/type pair)** — corrected from this
      section's original draft: GR's own Roadmap 2.8 shipped with a single
      `damage_formula`/`damage_type` pair per activity, then added a same-day
      follow-up lifting that to a repeatable list (e.g. a poisoned dagger's Attack
      activity: `1d4` piercing + `3d6` poison), matching dnd5e's real
      `damage.parts[]` array. `activitySchema.damage_parts` picked up the list
      shape directly rather than shipping the single-pair version first.
- [x] `itemSchema` gained `uses` (same shape as `featureSchema`'s) and
      `activities[]` (same schema).
- [x] Docs: [Docs/05-GR-Tools-Reference.md](Docs/05-GR-Tools-Reference.md) "Stat
      blocks" section gained an Activities/Feature-Details description, same
      section Phase 7.1's spellcasting fields are documented in.

**GR dependency:** Roadmap 2.8 — shipped in GR v2.0.0–v2.0.2.

### Phase 8 — MCP surface beyond tools (shipped items)

- [x] **Prompts** ✅ shipped (v1.4.0) — reusable MCP prompts
      encoding real DM workflows: `gr_session_prep` (reads module outline + latest
      session log, asks the model to pull upcoming sections itself, drafts the prep
      sheet), `gr_recap_writer`, `gr_statblock_from_description`,
      `gr_populate_encounter` (pick adversaries by CR budget from existing
      statblocks). See [CHANGELOG.md](CHANGELOG.md),
      [Docs/08-GR-Prompts-Reference.md](Docs/08-GR-Prompts-Reference.md), and
      [Tech_Docs/07-Connector-SDK.md](Tech_Docs/07-Connector-SDK.md) "Prompts".
- [x] **Response-size discipline** ✅ codified alongside Prompts — see
      [Tech_Docs/07-Connector-SDK.md](Tech_Docs/07-Connector-SDK.md) "Response-size
      discipline": any list/detail tool *or prompt handler* must have a bounded worst
      case, demonstrated by `gr_session_prep` fetching only the next 1-2 sections
      rather than walking the whole module.

The remaining Phase 8 items (Campaign Builder prompts, Resources) are still open —
see ROADMAP.md.

---

## Resolved Items
- ~~Provide the Geektastic Realms OpenAPI spec / endpoint docs + auth scheme~~ — resolved.
  See **Docs/API.md** in the geektastic-realms repo: `/api/v1/*` and the unified `grt_...`
  scoped bearer tokens (originally `grapi_...`), plus the full `gr-statblock-v1` field
  mapping. The connector in `packages/connectors/src/geektastic/` is implemented against it.
