import type { PromptDefinition } from "../../types.js";
import { optionalArg, renderInputs, requireArg, userMessage } from "./helpers.js";

/**
 * MCP prompt version of the `dm-campaign-builder` Claude Code skill's
 * "Module Builder" mode — see D:\github\dm-toolkit\dm-campaign-builder\SKILL.md.
 * No live Geektastic Realms data is read; this is a static instructional
 * template (transcribed verbatim from that skill) plus the user's argument
 * values interpolated in. See ROADMAP.md Phase 8 "Campaign Builder prompts".
 *
 * The source skill's Encounter Integration step invokes a separate
 * "dm-encounters" Claude Code skill inline — that instruction is preserved
 * verbatim below; if the calling client doesn't have that skill available,
 * the model should improvise the encounter itself instead (not a case this
 * prompt tries to special-case).
 */

const INSTRUCTIONS = `Produce a complete adventure module in Markdown using the structure below, in order.
No placeholders — every section must be specific and immediately runnable. Write for
a DM who will run this cold.

Module scale by length:
- **Short** (1 session): 3 acts, 1 chapter per act, 1–2 scenes per chapter (4–6 scenes total)
- **Standard** (2–3 sessions): 3 acts, 1–2 chapters per act, 2–3 scenes per chapter (6–10 scenes total)
- **Extended** (4+ sessions): 3 acts, 2–3 chapters per act, 3–4 scenes per chapter (12–16 scenes total)

---

#### Module Header Block

Quick-reference block at the top of the document:

- **Title:**
- **Setting:**
- **Party Level:**
- **Party Size:**
- **Module Length:**
- **Tone:**
- **Estimated Session Count:**

---

#### Adventure Synopsis

3–4 sentences. Concrete: who the villain or threat is, what they want, what the stakes are, and what the players must do. DM-facing summary only — not a player-facing hook.

---

#### Background (GM Only)

Under 200 words. The truth behind the hook — what is actually happening, why, and what the players do not know when they arrive. Never shown to players.

---

#### Adventure Hooks

Three distinct hooks, each approaching the same situation from a different player motivation:

- **Duty / Heroism** — the players are called to action by obligation, community ties, or moral imperative
- **Greed / Reward** — there is something the players want: money, magic, leverage, or information
- **Personal Connection** — one PC has a direct tie to the situation through backstory or a recent event

Write each hook as a situation paragraph. Describe what is happening and let players choose to engage.

---

#### Adventure Structure Overview

A flowchart-style Markdown outline showing the module's full structure: acts, chapters, scene names, key decision points, and the False Victory beat.

\`\`\`
# Act One: [Title]
  ## Chapter 1: [Title]
    → Scene 1: [Name]
    → Scene 2: [Name]

# Act Two: [Title]
  ## Chapter 2: [Title]
    → Scene 3: [Name] [False Victory]
    → Scene 4: [Name]
  ## Chapter 3: [Title]
    → Scene 5: [Name]

# Act Three: [Title]
  ## Chapter 4: [Title]
    → Scene 6: [Name] — Climax
    → Scene 7: [Name] — Denouement
\`\`\`

---

### Act Format

Use \`# Act [Number]: [Title]\` as the act heading.

Immediately after the heading, write the **Narrative Arc** — 2–3 paragraphs describing what happens in this act, chapter by chapter: what the party encounters, how the threat develops, what choices they face, and how this act transitions into the next. This is the DM's high-level guide to the act before they drill into individual scenes.

Act requirements:
- **Act One** — establishes the threat, introduces the world, draws players in; covers at least two of the Three Pillars (Combat, Exploration, Roleplay)
- **Act Two** — complicates the situation; includes the **[False Victory]** scene (players believe they have won before circumstances reverse); covers all three pillars across its scenes
- **Act Three** — climax and denouement; primary villain present; at minimum two paths to success; ends with a Denouement scene describing what changed

Then the chapters.

---

### Chapter Format

Use \`## Chapter [Number]: [Title]\` as the chapter heading.

Immediately after the heading, include a **Scene Summary Table**:

| Title | Summary |
|---|---|
| [Scene Name] | [One sentence: what happens and why it matters] |

Then the full scenes in order.

---

### Scene Format

Use \`## Scene [Number]: [Title]\` as the scene heading. Every scene must include all of the following sections, in order.

---

#### Quest Log

A bulleted checklist the DM can reference at a glance during play:
- [ ] [Primary objective — what the party must accomplish]
- [ ] [Secondary objective or key event]
- [ ] [Optional: bonus discovery or alternative path]

---

#### Scene Overview

- **Setting:** Location name and one sentence of physical and atmospheric context
- **Scene Type:** Combat / Social / Exploration / Puzzle / Mixed
- **Beats:**
  1. [Beat 1: opening situation — how the scene begins]
  2. [Beat 2: complication or escalation — what changes mid-scene]
  3. [Beat 3: climax of this scene — the decisive moment]
  4. [Beat 4: resolution — include for longer scenes]

---

#### DM Context

*GM Only.* Everything the DM needs to know before running this scene:
- What is happening behind the scenes, not visible to players
- NPC motivations and agendas at this moment
- Environmental or mechanical details that matter
- How this scene connects to earlier and later scenes
- What the party can discover here and what remains hidden

Write in present tense.

---

*The scene narrative then flows through its beats. Use H1 headers (\`#\`) for major narrative beats and H2 headers (\`##\`) for sub-elements within each beat. Each beat section must include at minimum a Read Aloud block and a DM Notes block.*

---

#### Read Aloud

At least one Read Aloud block per scene; include one per major beat when the situation changes meaningfully. Write to be read directly to players.

> [!note] Read Aloud
> [2–5 sentences. Present tense. Sensory and atmospheric. No DM-only information. No mechanical references. Write what the players experience, not what is happening behind the scenes.]

---

#### DM Notes

A DM Notes block follows each Read Aloud section. Include one per major beat.

> [!warning] DM Notes
> **What Players Don't Know:** [Hidden information — what is happening beneath the surface at this moment]
>
> **Skill Check Opportunities:**
> | Skill | DC | Success | Failure |
> |---|---|---|---|
> | [Skill] | DC [X] | [What they learn or gain] | [What they miss or face] |
>
> [Additional DM context: NPC reactions, what happens if players engage or don't, environmental interactions, tactical notes for this beat]

---

#### Encounter Integration

When a scene beat contains a combat encounter or a random encounter table, invoke the **dm-encounters** skill with the necessary inputs and insert its full output inline at that position in the scene (if that skill isn't available in the current environment, improvise the encounter directly using the same structure it would produce: creatures, tactics, and a difficulty rating).

Inputs to provide to dm-encounters:
- Party Level
- Party Size
- Environment (matching the scene setting)
- Encounter Type (Combat / Ambush / Random Table / etc.)
- Difficulty (Easy / Medium / Hard / Deadly)
- Specific creatures, factions, or tactical context relevant to this scene

The dm-encounters output — including creature stat blocks, tactical notes, and encounter-specific details — displays inline in the scene narrative at the point where the encounter occurs.

---

#### Treasure

*Include only when the scene awards treasure.* Give this section its own header.

\`## Treasure\`

| Item | Description | Value |
|---|---|---|
| [Item Name] | [One sentence description or origin] | [gp / sp / cp value, or "Priceless"] |

Include all coins, magic items, information rewards, and quest items found in this scene. Reference DMG/PHB pricing.

---

#### Transition

Every scene ends with a Transition section.

- **What the Party Should Have Accomplished:**
  - [Expected outcome 1]
  - [Expected outcome 2]
- **If They Didn't:** One sentence on how to proceed if the party missed a key beat or failed a critical moment
- **Setup for Next Scene:** One sentence bridging this scene's resolution to what comes next

---

### Key NPCs
3–6 NPCs. Supporting NPCs use the compact format; the primary villain uses full villain depth.

**Supporting NPC format (use for all non-villain NPCs):**
- **Name** — Race, Role
- **Motivation** — what they want from this situation
- **One Secret** — something players may discover that changes how they read this character
- **How Players Meet Them** — the specific scene or circumstance of first contact

---

**Primary Villain — Full Villain Depth:**

The primary villain entry replaces the compact NPC format. A well-made villain is not a collection of stats — it is a person with a coherent internal logic. The backstory explains the motivation; the motivation drives the plan; the plan creates the encounter beats. Every section should reinforce that throughline.

##### The Villain at a Glance
- **Name & Title**
- **Race & Age**
- **Alignment**
- **One-Sentence Summary** — what they want, what they're willing to do to get it, and what makes them dangerous

##### Backstory
3–4 paragraphs:
1. Who they were before — origin, people, what they wanted from the world
2. The turning point — a specific event or slow erosion that set them on this path; the more concrete, the more believable
3. What they have already done by the time the players meet them — track record, scale, consequence

##### Motivation & Worldview
- **What They Want** — stated goal and real goal; these may align or diverge
- **Why They Believe They Are Right** — 2–3 sentences written from the villain's own perspective; this should be uncomfortably coherent; if it reads like a cartoon monologue, rewrite it
- **What They Fear** — emotional or philosophical vulnerability; not necessarily a combat weakness
- **What They Love** — one person, place, ideal, or memory that humanizes them without excusing them

##### The Villain's Plan Mapped to the Module
- **Act One Stage** — what the villain is doing during Act One; how players can observe or disrupt it
- **Act Two Stage** — how the plan escalates in Act Two; what stopping them here changes
- **Act Three Stage** — the endgame; what the villain does if the players haven't stopped them by now

##### Escalation Beats
- **Underestimation Moment** — a scene where players assume they have the measure of the villain and are proven wrong; this should sting, not destroy
- **Humanity Moment** — a scene where the villain's humanity briefly shows; this is the beat that makes the final confrontation mean something
- **Point of No Return** — the moment the villain crosses a line that makes reconciliation impossible

##### Lieutenants
2–3 subordinates or allied figures (if applicable):
- **Name, Race, Role**
- Loyalty type: True believer / Pragmatist / Coerced / Secretly plotting
- One way they can be turned against the villain or used as a player-facing hook

##### Lair & Resources
- **Base of Operations** — location, atmosphere, one unique environmental feature that reflects the villain's character or methods
- **Resources** — armies, wealth, information networks, magical artifacts, political influence; scale to module scope
- **Defenses** — how the villain protects themselves; defenses should reflect how the villain thinks, not just how powerful they are

##### Villain Stat Block

Produce a complete stat block using the **Fantasy Stat Blocks** Obsidian plugin format. For climax villains, include \`legendary_actions:\`. At least one trait must reflect the villain's ideology or method mechanically, not just as flavor.

All rules references use D&D 5e 2014 unless the user has specified otherwise.

\`\`\`\`statblock
layout: Basic 5e Layout
image:
name: [Villain Name]
size: [Size]
type: [type]
subtype:
alignment: [alignment]
ac: [number]
hp: [number]
hit_dice: [dice formula]
speed: [speed]
stats: [STR, DEX, CON, INT, WIS, CHA]
saves:
  - [abbrev]: [+bonus]
skillsaves:
  - [skill]: [+bonus]
damage_vulnerabilities:
damage_resistances:
damage_immunities:
condition_immunities:
senses: [senses]
languages: [languages]
cr: [number]
spells:
  - "[Spellcasting description]"
  - "[Cantrips (at will): spell1, spell2]"
  - "[1st level (X slots): spell1, spell2]"
traits:
  - name: Legendary Resistance (3/Day)
    desc: "If [Villain Name] fails a saving throw, it can choose to succeed instead."
  - name: [Signature Trait Name]
    desc: "[Trait that reflects the villain's ideology or method mechanically]"
actions:
  - name: Multiattack
    desc: "[Description]"
  - name: [Attack or Signature Ability]
    desc: "[+X to hit, reach/range. Hit: damage. Any rider effects or save DCs.]"
legendary_actions:
  - name: [Action Name]
    desc: "[Description. Costs X Actions.]"
reactions:
  - name: [Reaction Name]
    desc: "[Trigger. Effect.]"
bonus_actions:
  - name: [Bonus Action Name]
    desc: "[Description]"
\`\`\`\`

---

#### Location Key
Area-by-area reference for the key locations in the module. For each area:

- **[Number]. [Area Name]**
  - **Description** — 2–3 sentences of sensory detail (what players see, hear, smell)
  - **Contents** — what is present: creatures, objects, hazards, interactable elements
  - **Plot Connection** — how this area connects to the adventure's story or the villain's plan

#### Encounter Balance Summary
A table tracking all encounters across the module:

| Encounter | Act | Type | Creatures | CR | Adjusted XP | Difficulty |
|---|---|---|---|---|---|---|
| [Name] | One/Two/Three | Combat/Social/Exploration | [Name (qty)] | [CR] | [XP] | Easy/Med/Hard/Deadly |

**Total XP:** [sum]

Note if total XP falls outside the party's adventuring day budget for their level (per DMG guidelines).

#### Rewards and Treasure Summary

| Reward Type | Description | Quantity / Value |
|---|---|---|
| XP | Total from all encounters | [amount] |
| Magic Items | [Name] | [Rarity] |
| Coin | Accumulated across encounters | [GP value] |
| Narrative Rewards | Reputation, allies, information | [description] |

#### Adventure Hooks for Continuation
2–3 seeds that grow from this module's resolution. These should feel like natural consequences of what happened, not bolted-on sequel hooks.

---

### Output Format

Format the full module as Markdown suitable for use in Obsidian. Header hierarchy: \`#\` for Acts and major narrative beats within scenes, \`##\` for Chapters, scene headings, and beat sub-elements. Use Obsidian callout blocks (\`> [!note]\` for Read Aloud, \`> [!warning]\` for DM Notes) throughout scene narratives. Bold NPC names, location names, and faction names on first mention. No emojis. Use Markdown tables for Scene Summary Tables, Skill Check Opportunities, Treasure sections, the Encounter Balance Summary, and the Rewards and Treasure Summary. Use fenced code blocks for stat blocks.`;

const WORLD_INTEGRATION = `---

### Campaign World Integration

Using the campaign world details supplied above, weave the relevant setting elements into the output. Consider:
- How local power structures or factions shape the content
- Any cultural, religious, or political details specific to the setting
- World-specific constraints, lore, or flavor the user mentioned
- Unique setting elements that would distinguish this content from generic fantasy

Add this as its own \`#### Campaign World Integration\` section after Adventure Hooks for Continuation.`;

export const moduleBuilderPrompt: PromptDefinition = {
  name: "campaign_module_builder",
  description:
    "Design a complete D&D adventure module — Acts/Chapters/Scenes, fully scripted narrative beats, encounter " +
    "integration, and a full villain-depth antagonist. Converted from the dm-campaign-builder skill's Module Builder mode.",
  arguments: [
    { name: "module_title", description: "If omitted, one is generated." },
    { name: "campaign_setting", description: "The world or region where the adventure takes place.", required: true },
    { name: "world_details", description: "Factions, lore, cultural details, or constraints to weave into the output." },
    { name: "party_level", description: "Drives CR, encounter difficulty, and reward scaling.", required: true },
    { name: "party_size", description: "Affects encounter balance; standard is 4-5 players.", required: true },
    {
      name: "module_length",
      description: "Short (1 session) / Standard (2-3 sessions) / Extended (4+ sessions).",
      required: true,
    },
    { name: "primary_villain", description: "If omitted, one is generated." },
    {
      name: "tone",
      description: "Dark / Heroic / Political / Horror / Mystery / Epic — combinations allowed.",
      required: true,
    },
    { name: "hook_preference", description: "If omitted, all three standard hooks are generated." },
    { name: "pc_connections", description: "Backstory elements to weave into the villain or hook." },
  ],
  async handler(args) {
    const campaignSetting = requireArg(args, "campaign_setting");
    const partyLevel = requireArg(args, "party_level");
    const partySize = requireArg(args, "party_size");
    const moduleLength = requireArg(args, "module_length");
    const tone = requireArg(args, "tone");
    const moduleTitle = optionalArg(args, "module_title");
    const worldDetails = optionalArg(args, "world_details");
    const primaryVillain = optionalArg(args, "primary_villain");
    const hookPreference = optionalArg(args, "hook_preference");
    const pcConnections = optionalArg(args, "pc_connections");

    const inputs = renderInputs([
      { label: "Module Title", value: moduleTitle ?? "(not given — generate one)" },
      { label: "Campaign Setting", value: campaignSetting },
      { label: "Campaign World Details", value: worldDetails },
      { label: "Party Level", value: partyLevel },
      { label: "Party Size", value: partySize },
      { label: "Module Length", value: moduleLength },
      { label: "Primary Villain or Threat", value: primaryVillain ?? "(not given — generate one)" },
      { label: "Tone", value: tone },
      { label: "Adventure Hook Preference", value: hookPreference ?? "(not given — generate all three standard hooks)" },
      { label: "PC Connections", value: pcConnections },
    ]);

    const parts = [inputs, "", INSTRUCTIONS];
    if (worldDetails) parts.push("", WORLD_INTEGRATION);

    return { description: "Module Builder — complete adventure module design", messages: userMessage(parts.join("\n")) };
  },
};
