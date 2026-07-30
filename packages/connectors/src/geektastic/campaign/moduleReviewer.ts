import type { PromptDefinition } from "../../types.js";
import { optionalArg, renderInputs, requireArg, userMessage } from "./helpers.js";

/**
 * MCP prompt version of the `dm-campaign-builder` Claude Code skill's
 * "Module Reviewer" mode — see D:\github\dm-toolkit\dm-campaign-builder\SKILL.md.
 * No live Geektastic Realms data is read; this is a static instructional
 * template (transcribed verbatim from that skill) plus the user's argument
 * values interpolated in. See ROADMAP.md Phase 8 "Campaign Builder prompts".
 *
 * Includes the source skill's villain-offer workflow: if no primary
 * antagonist is identifiable in the supplied module, the model is instructed
 * to offer to build one and, on a follow-up call with villain details filled
 * in as free text within the module document (or a new call to
 * campaign_module_builder), produce the full Villain section.
 */

const INSTRUCTIONS = `Produce a complete module review in Markdown using the structure below, in order.
Cite specific encounters, NPCs, and scenes by name. Give fixes that a DM can implement
in under 30 minutes. Generic observations are not useful.

On intake, silently check whether a primary villain or antagonist is identifiable in
the module above. This primes the villain-offer workflow below.

---

#### Module Overview Assessment
2–3 sentences: what the module's premise is, its strongest quality, and its single biggest structural gap.

#### Hook Analysis
Rate each of the three hook types (Duty/Heroism, Greed/Reward, Personal Connection) on four dimensions:

| Hook Type | Clarity | Motivation Coverage | Personalizability | Agency |
|---|---|---|---|---|
| Duty / Heroism | Strong / Adequate / Weak / Absent | — | — | — |
| Greed / Reward | — | — | — | — |
| Personal Connection | — | — | — | — |

For any hook rated Weak or Absent, suggest a specific replacement or addition.

#### Three-Pillar Coverage Audit
A table showing which encounters cover which pillar:

| Encounter | Act | Combat | Exploration | Roleplay |
|---|---|---|---|---|
| [Encounter Name] | One/Two/Three | ✓ / — | ✓ / — | ✓ / — |

Flag any pillar absent from the module entirely, or any act that is all Combat with no Exploration or Roleplay.

#### Encounter Quality Analysis
For each encounter in the module:

- **Current State** — what the encounter does well, in one sentence
- **Strengths** — the design element working best (Goal clarity / Threat / Choices / Consequences / Read-Aloud)
- **Issues** — specific problems by dimension: Goal / Threat / Choices / Consequences / Read-Aloud
- **Suggested Improvements** — one concrete change per issue; implementable in under 30 minutes

#### Pacing and Structure Review
Map the module's encounters to acts. Assess:
- Three-act structure: is the module clearly divided into Setup, Confrontation, and Resolution?
- False Victory: is there a beat where players believe they have succeeded before circumstances reverse? If missing, flag it and suggest placement.
- Rest opportunities: are there natural rest points between acts for a multi-session module?
- Climax payoff: does the final encounter feel like the culmination of what came before?

#### NPC and Villain Assessment

**Supporting NPCs:**
- Are named NPCs consistent across encounters?
- Are there any setup-without-payoff NPCs — characters introduced but never given a meaningful scene?

**BBEG Standard Check:**
Rate: **Meets** / **Partially meets** / **Does not meet**
- **Meets** — primary villain appears (directly or indirectly) in at least two encounters before the climax
- **Partially meets** — one pre-climax appearance, or referenced but not felt
- **Does not meet** — villain arrives only at the climax

If Partially meets or Does not meet, give one specific fix.

**Villain-Offer Workflow:**
If no primary villain or antagonist is identifiable in the module, output the following verbatim:

> No primary villain or antagonist was identified in this module. A central antagonist significantly strengthens both the BBEG Standard and the module's pacing. Would you like me to build one?
>
> To build a villain that fits this module, I'll need:
> - Villain Type (Warlord / Cult Leader / Corrupt Noble / Fallen Hero / Ancient Evil / Mastermind / Fanatic / Monster in Human Form / Revolutionary Gone Wrong)
> - Scope (Local / National / World-Altering)
> - Campaign Tone (Dark / Heroic / Political / Horror / Mystery / Epic)
> - Any PC connections to weave in (optional)
>
> If you provide these, I'll produce a complete Villain section using the full Villain Builder format and integrate it with the module's acts and encounter structure.

If the user responds with villain inputs, produce the full Primary Villain section from
Module Builder (Villain at a Glance / Backstory / Motivation & Worldview / The Villain's
Plan Mapped to the Module / Escalation Beats / Lieutenants / Lair & Resources / Villain
Stat Block, all as specified in the campaign_module_builder prompt's format) and append
it as \`#### Villain Section\` to the review, with the villain's plan explicitly mapped
to the module's existing acts.

#### Encounter Balance Assessment
A table tracking all encounters:

| Encounter | Creatures | CR | Adjusted XP | Difficulty | Suggested Adjustment |
|---|---|---|---|---|---|
| [Name] | [Name (qty)] | [CR] | [XP] | Easy/Med/Hard/Deadly | [None / suggestion] |

Flag any Deadly encounters without clear narrative justification.

#### Railroading Risk Assessment
Identify any encounters or scenes with a single success path — where the story only advances if players succeed at one specific thing. For each flagged point, offer one specific fix.

Rate overall railroading risk: **Low** / **Medium** / **High**.

#### Top 5 Priority Improvements
Ranked list of the five most impactful changes. Each item must:
- Name the specific encounter, NPC, or section
- State the problem
- Give a concrete fix implementable in under 30 minutes
- Be ranked by impact, not order of appearance

#### What's Working Well
2–3 specific strengths. Name the encounter, choice, or design element and explain why it works.

---

### Output Format

Format the review as Markdown with headers and subheaders suitable for use in Obsidian. No emojis. Bold encounter names and NPC names on first mention.`;

export const moduleReviewerPrompt: PromptDefinition = {
  name: "campaign_module_reviewer",
  description:
    "Audit an existing D&D adventure module against design best practices — hooks, pacing, encounter balance, " +
    "railroading risk — with a villain-offer workflow if no antagonist is identifiable. Converted from the " +
    "dm-campaign-builder skill's Module Reviewer mode.",
  arguments: [
    {
      name: "module_document",
      description: "The full module document or a scene-by-scene summary — more detail produces more specific critique.",
      required: true,
    },
    { name: "party_level", description: "Helps calibrate CR and balance observations." },
    { name: "party_size", description: "Used to assess encounter balance." },
    { name: "world_details", description: "Setting context that may explain unusual structural choices." },
  ],
  async handler(args) {
    const moduleDocument = requireArg(args, "module_document");
    const partyLevel = optionalArg(args, "party_level");
    const partySize = optionalArg(args, "party_size");
    const worldDetails = optionalArg(args, "world_details");

    const inputs = renderInputs([
      { label: "Party Level", value: partyLevel },
      { label: "Party Size", value: partySize },
      { label: "Campaign World Details", value: worldDetails },
    ]);

    const parts = [
      "# Module to Review",
      "",
      moduleDocument,
      "",
      inputs,
      "",
      INSTRUCTIONS,
    ];

    return { description: "Module Reviewer — adventure module audit", messages: userMessage(parts.join("\n")) };
  },
};
