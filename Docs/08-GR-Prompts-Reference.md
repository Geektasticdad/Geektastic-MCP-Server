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

## Trying these out

Use the **Testing Playground**'s Prompts tab to run any of these from your
browser first — fill in the arguments, click **Run prompt**, and read the
resulting message(s) before wiring the same prompt up in an MCP client. See
[User Guide → Testing Playground](03-User-Guide.md#testing-playground).
