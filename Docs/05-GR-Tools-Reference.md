# Geektastic Realms Tools Reference

Every tool below is contributed by the **Geektastic Realms** connector. An
admin can enable/disable each one individually under **Tools** (see
[Administrator Guide](02-Admin-Guide.md#tools)) — if a tool you expect isn't
showing up for your MCP client, check there first.

All of these operate on whichever Geektastic Realms **world** the connection
points at (its base URL + API key). "Entry id" and "category id" below are
Geektastic Realms' own internal ids — the tools that search or list things
return the ids you need for the tools that fetch/create/update a single thing.

## Stat blocks

Stat blocks are combat-ready creature statistics (AC, HP, abilities, actions,
etc.) attached to an entry.

| Tool | What it does |
|---|---|
| `gr_search_statblocks` | Search stat blocks by name/title. Leave the query blank to list everything (capped at 100 results when you do search). |
| `gr_get_statblock` | Fetch one stat block in full, by entry id. |
| `gr_create_statblock` | Create a new entry with a stat block, in a given category. |
| `gr_update_statblock` | Replace an existing stat block's fields (by entry id). Note: this replaces the entire `features`/`items` lists, not a merge. |

A stat block includes: size, type, alignment, AC, HP, speed, the six ability
scores, saves/skills/senses/languages, damage/condition modifiers, challenge
rating, XP, a list of **features** (traits, actions, bonus actions, reactions,
legendary/lair actions, spellcasting, regional effects), and a list of
**items** (weapons, armor, magic items, gear, currency, etc. with quantity,
weight, value, and attunement info).

## Campaigns

A campaign is a named arc grouping several adventure modules together.

| Tool | What it does |
|---|---|
| `gr_list_campaigns` | List every campaign in the world. |
| `gr_get_campaign` | Fetch one campaign by id. |
| `gr_create_campaign` | Create a new campaign (title, summary, description, status). |
| `gr_update_campaign` | Update an existing campaign by id. |

A campaign's cover image is web-editor-only — there's no tool to set it (same
treatment as an entry's image/gallery/map custom fields).

## Lore entries (any category)

Entries are the general building block in Geektastic Realms — NPCs,
locations, items, factions, or any other custom category a world defines.
Unlike stat blocks, an entry's extra data lives in **custom fields**, which
differ per category.

| Tool | What it does |
|---|---|
| `gr_search_entries` | Search entries by title, optionally scoped to one category. Omit the query to list a whole category. |
| `gr_get_entry` | Fetch one entry in full (including its `custom_fields` and `tags`), by id. |
| `gr_create_entry` | Create a new entry in a given category. |
| `gr_update_entry` | Update an existing entry by id. |

An entry has a title, summary, body (HTML), status (draft/published/archived),
visibility (private/members/public), an optional parent entry, tags, and the
category-specific `custom_fields` object — keyed by each field's stable name,
not a numeric id. Image, gallery, and map fields can't be set through this API
(they're read-only here).

## Adventure modules

A module is a full adventure: a tree of **Acts → Chapters → Scenes**, plus
**Appendices**, each of which can contain **encounters** and **handouts**.

| Tool | What it does |
|---|---|
| `gr_list_modules` | List every module in the world. |
| `gr_get_module` | Fetch a module's outline: its Act/Chapter/Scene/Appendix structure, **without** body text (encounters/handouts show as name-only stubs). A full module can be hundreds of KB of text, so this stays lightweight — use `gr_get_section` to read the actual content. |
| `gr_create_module` | Create a new module (title, summary, overview, level range, party size, status, visibility, campaign). Sections aren't created here — use `gr_create_section` afterward. |
| `gr_update_module` | Update a module's own fields by id. |
| `gr_search_sections` | Find an Act/Chapter/Scene/Appendix by title across **every** module in the world, when you don't already know which module it's in. |
| `gr_get_section` | Fetch one section's **full content** — body text, complete encounters and handouts, and one level of child sections (their titles only, not their content) — by module id + section id. This is how you actually read a scene. |
| `gr_create_section` | Create an Act, Chapter, Scene, or Appendix inside a module. If it has a parent (e.g. a Chapter inside an Act), pass the parent's section id. |
| `gr_update_section` | Update an existing section's type/title/body/parent by id. |

### Handouts

| Tool | What it does |
|---|---|
| `gr_get_handout` | Fetch a single handout by id, without pulling the whole section. |
| `gr_create_handout` | Create a handout inside a module — either module-level (no `section_id`) or attached to a specific section. |
| `gr_update_handout` | Update an existing handout by id. |
| `gr_delete_handout` | Permanently delete a handout. No undo. |

### Encounters

| Tool | What it does |
|---|---|
| `gr_get_encounter` | Fetch a single encounter by id (with resolved adversaries), without pulling the whole section. |
| `gr_create_encounter` | Create an encounter inside a specific section (typically a Scene). Can set its **adversaries** (the creatures fighting the party) in the same call. |
| `gr_update_encounter` | Update an existing encounter by id, including its adversaries. |
| `gr_delete_encounter` | Permanently delete an encounter (its adversary links go with it). No undo. |

An encounter has a name, type (combat/social/exploration/puzzle/trap/other),
difficulty, setup, tactics, rewards, and notes, plus an **adversaries** list —
each entry is `{ entry_id, quantity }`, pointing at a stat-block-bearing entry
found via `gr_search_statblocks`.

**Important:** sending `adversaries` on `gr_create_encounter`/
`gr_update_encounter` **replaces the entire list**, it does not add to it. If
you want to add or remove a single creature from an existing encounter's
roster, first read the current list with `gr_get_section` (which returns each
encounter's resolved adversaries), then send the full updated list back.

### Deleting a section

| Tool | What it does |
|---|---|
| `gr_delete_section` | Permanently delete an Act/Chapter/Scene/Appendix. Child sections and encounters attached to it go with it; handouts and roll tables attributed to it are detached (become adventure-level) rather than deleted. No undo. |

## Roll tables

Wandering-monster tables, loot tables, rumor tables — any table a DM rolls on
during play. A table can be adventure-level or attributed to a specific
section, and is embeddable anywhere via the web editor's `/rolltable`
slash command regardless of that attribution.

| Tool | What it does |
|---|---|
| `gr_list_roll_tables` | List every roll table in a module (lightweight — id, title, computed die, row count; no rows). |
| `gr_get_roll_table` | Fetch one table's full detail, including every row, by module id + roll table id. |
| `gr_create_roll_table` | Create a roll table in a module. Each row needs at least a `range_start` (`range_end` defaults to it); the die size (d4–d100) is computed automatically from the highest `range_end`, never set directly. |
| `gr_update_roll_table` | Update an existing table by id. |

**Important:** sending `rows` on `gr_update_roll_table` **replaces the entire
list**, the same as `adversaries` above — fetch the table first with
`gr_get_roll_table` if you only want to add or edit one row.

## Session logs

A DM-only record of past game sessions — what happened, follow-ups, and the
recap to open next time with.

| Tool | What it does |
|---|---|
| `gr_list_sessions` | List every session logged for a module (lightweight — title, date, XP/GP, no recap text). |
| `gr_get_session` | Fetch one session's full detail: summary, notes, next-session prep, player recap, XP/GP/loot, and which sections it covered. |
| `gr_create_session` | Log a new session. Hand this a DM's messy notes and it becomes the structured recap. |
| `gr_update_session` | Update an existing session log by id. |

**Important:** sending `sections_covered` on `gr_update_session` **replaces
the entire list**, same pattern as adversaries/roll table rows.

## World history

Eras (named historical periods) and events (discrete moments in the world's
timeline) — see the world's **History** page in the web app.

**These tools need the connection's token to have `history` scope**, separate
from `entries`/`modules`/`campaigns`/`foundry` — if they 403, check the
token's scopes on the Geektastic Realms side first (see
[Administrator Guide](02-Admin-Guide.md)).

| Tool | What it does |
|---|---|
| `gr_list_eras` | List every era in this world's history. |
| `gr_get_era` | Fetch a single era by id. |
| `gr_create_era` | Create a new era. `age_id`, if given, must reference a calendar age (epoch) already defined in the world's calendar. |
| `gr_update_era` | Update an existing era by id. |
| `gr_list_events` | List every historical event in this world. |
| `gr_get_event` | Fetch a single event by id. |
| `gr_create_event` | File a new historical event, optionally grouped under an era. `is_secret` hides it from public-facing pages. |
| `gr_update_event` | Update an existing event by id. |

## Deleting a lore entry

| Tool | What it does |
|---|---|
| `gr_delete_entry` | Permanently delete a lore entry — its stat block, custom field values, tags, and relations are cascade-deleted too. No undo. |

## A note on deletes

None of the delete tools above (`gr_delete_entry`, `gr_delete_section`,
`gr_delete_encounter`, `gr_delete_handout`) have an undo. If you'd rather your
MCP clients couldn't delete anything, disable these four tools individually
under **Tools** (see [Administrator Guide](02-Admin-Guide.md#tools)) — every
other tool on this page is unaffected.

## Not yet available

Deletes for **campaigns**, **roll tables**, and **session logs** — Geektastic
Realms doesn't expose those `DELETE` endpoints yet, so there's nothing for a
tool to call. Remove them from the web app in the meantime.
