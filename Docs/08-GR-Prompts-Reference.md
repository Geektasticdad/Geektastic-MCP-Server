# Geektastic Realms Prompts Reference

**Prompts** are a different kind of MCP building block from Tools (see
[Geektastic Realms Tools Reference](05-GR-Tools-Reference.md)): where a tool is
something the AI assistant decides to call on its own mid-conversation, a
prompt is a ready-made template your MCP client can offer you directly —
often as a slash command or a menu item — that seeds the conversation with
useful context and a clear task. An admin can enable/disable each one
individually under **Prompts** (see
[Administrator Guide](02-Admin-Guide.md#prompts)).

Each prompt below reads a bounded amount of real data from your Geektastic
Realms world before handing the model its task — enough to be useful without
dumping an entire module's worth of text into the conversation.

## `gr_session_prep`

Prep for your next session of a module. Reads the module's outline and the
most recent session log (its recap and next-session notes), then asks the
model to pull the specific upcoming section(s) it needs and draft a full prep
sheet: story-so-far recap, likely encounters/NPCs, key decision points, and a
DM prep checklist.

**Arguments:** `module_id` (required) — which module to prep for.

## `gr_recap_writer`

Turn your messy, typed-in-a-hurry session notes into a polished, read-aloud
recap for your players, plus a short DM-facing list of continuity facts (NPCs
met, promises made, loot gained) worth logging.

**Arguments:** `session_notes` (required) — your raw notes. `module_id`
(optional) — pulls the previous session's recap for continuity if given.

## `gr_statblock_from_description`

Turn a natural-language creature concept ("a rot-cursed treant guarding a
flooded shrine") into a full 5e-style stat block design, including CR-
appropriate design guidance the model uses to calibrate AC/HP/damage/action
economy, ready to file with `gr_create_statblock`.

**Arguments:** `description` (required) — the creature concept.
`challenge_rating` (optional) — a target CR, if you have one in mind.

## `gr_populate_encounter`

Builds a candidate roster of adversaries from your world's existing stat
blocks and asks the model to pick a CR-budget-balanced mix for a new
encounter, showing its math, then create it with `gr_create_encounter`.

**Arguments:** `module_id`, `section_id`, `cr_budget` (all required) —
where the encounter goes and the target difficulty budget. `theme`
(optional) — narrows the candidate search (e.g. "swamp", "undead").

## Campaign Builder Prompts

Unlike the four prompts above, these six don't read anything from your connected
Geektastic Realms world — each is a self-contained instructional template
(converted from the `dm-campaign-builder` Claude Code skill) that seeds the model
with a complete design or review brief, using only the argument values you supply.
That makes them usable from any MCP client, not just Claude Code.

### `campaign_arc_builder`

Design a complete, playable multi-session story arc — inciting incident, escalating
beats, a mandatory "false victory" moment, key NPCs, faction involvement, a climax,
two possible endings, and seeds for the next arc — plus a compliance table showing
which of the six arc-design principles the result satisfies.

**Arguments:** `campaign_setting`, `party_level_range`, `session_count`, `tone`
(all required). `world_details`, `central_conflict`, `pc_hooks` (optional).

### `campaign_arc_reviewer`

Evaluate an existing arc against the same six design principles Arc Builder uses —
three-act structure, the BBEG standard, the false-victory beat, anti-railroading,
three-pillar balance, escalating stakes — and produce a ranked, actionable critique
without rewriting the arc.

**Arguments:** `arc_document` (required). `party_level_range`, `session_count`,
`world_details` (optional).

### `campaign_faction_builder`

Create a fully developed organization: identity (public face vs. true purpose),
a three-tier leadership hierarchy with personal secrets, short/long-term goals and
methods, membership and resources, a relationship table with at least one
"complicated" faction, and three player interaction points plus adventure hooks.

**Arguments:** `faction_type`, `power_level`, `location`, `relationship_to_players`
(all required). `faction_name`, `existing_factions`, `world_details` (optional).

### `campaign_faction_reviewer`

Evaluate an existing faction document against Faction Builder's own quality bar —
identity coherence, leadership distinctiveness, goal/method consistency, membership
and weakness quality, the relationship table, player interaction points, and hook
quality — with a ranked, actionable critique.

**Arguments:** `faction_document` (required). `other_factions`, `world_details`
(optional).

### `campaign_module_builder`

Design a complete adventure module — Acts, Chapters, and fully scripted Scenes (quest
log, beats, DM context, read-aloud text, DM-only notes, encounter integration,
treasure, transitions), supporting NPCs, and a full villain-depth antagonist
(backstory, worldview, a plan mapped to the module's acts, escalation beats,
lieutenants, and a complete stat block), plus encounter balance and rewards summaries.

**Arguments:** `campaign_setting`, `party_level`, `party_size`, `module_length`,
`tone` (all required). `module_title`, `world_details`, `primary_villain`,
`hook_preference`, `pc_connections` (optional).

### `campaign_module_reviewer`

Audit an existing adventure module against the same design bar — hook quality,
three-pillar coverage, encounter quality, pacing, NPC/villain presence, encounter
balance, and railroading risk — with a ranked critique. If no primary villain is
identifiable in the module, it offers to build one and, given villain details,
appends a full Villain section mapped to the module's existing acts.

**Arguments:** `module_document` (required). `party_level`, `party_size`,
`world_details` (optional).

## Trying these out

Use the **Testing Playground**'s Prompts tab to run any of these from your
browser first — fill in the arguments, click **Run prompt**, and read the
resulting message(s) before wiring the same prompt up in an MCP client. See
[User Guide → Testing Playground](03-User-Guide.md#testing-playground).
