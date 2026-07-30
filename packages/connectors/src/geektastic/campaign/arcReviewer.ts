import type { PromptDefinition } from "../../types.js";
import { optionalArg, renderInputs, requireArg, userMessage } from "./helpers.js";

/**
 * MCP prompt version of the `dm-campaign-builder` Claude Code skill's
 * "Arc Reviewer" mode — see D:\github\dm-toolkit\dm-campaign-builder\SKILL.md.
 * No live Geektastic Realms data is read; this is a static instructional
 * template (transcribed verbatim from that skill) plus the user's argument
 * values interpolated in. See ROADMAP.md Phase 8 "Campaign Builder prompts".
 */

const INSTRUCTIONS = `Arc Reviewer evaluates the arc above against the six Design Principles used by Arc
Builder. It does not rewrite the arc — it produces an actionable critique with
specific, achievable fixes.

Produce a complete arc review document in Markdown using the structure below, in
order. Be specific — cite beat names, identify the exact location of problems, and
give fixes a DM can implement in under 30 minutes. Generic observations ("the pacing
could be better") are not useful.

---

#### Arc Overview Assessment
2–3 sentences: what the arc's premise is, its strongest quality, and its single biggest structural gap.

#### Three-Act Structure Analysis
Map each beat to an act. Rate each act:
- **Strong** — multiple beats, clear escalation, meaningful player choices
- **Present but thin** — one beat, or beats that don't escalate
- **Missing** — no beats serve this act's function

If Setup or Resolution is missing, flag it as a critical gap.

#### Beat Escalation and False Victory Check
List the beats in sequence. For each, note its act position and whether it escalates from the previous beat. Flag any beats that plateau or reset tension without narrative justification.

Identify the False Victory beat explicitly. If none exists, flag it:

> **Missing: False Victory beat.** A False Victory is mandatory — one Confrontation beat where players believe they have succeeded before the situation reverses or deepens. Suggested placement: [recommend which beat to restructure and how].

#### BBEG Standard Assessment
Rate: **Meets** / **Partially meets** / **Does not meet**.

- **Meets** — villain appears (directly or indirectly) in at least two beats before the climax
- **Partially meets** — villain has one pre-climax appearance, or is referenced but not felt
- **Does not meet** — villain arrives only at the climax with no prior presence

If Partially meets or Does not meet, give one specific fix: which beat to add or modify and what the villain should do or reveal there.

#### Player Agency and Anti-Railroading Assessment
Identify any beats with a single success path — beats where the story only advances if players succeed at one specific thing. For each flagged beat, offer one branching alternative that preserves the beat's narrative function while accepting a different outcome.

Rate overall railroading risk: **Low** / **Medium** / **High**.

#### NPC and Faction Coherence
- Do named NPCs appear consistently across multiple beats, or does a character introduced in Beat 2 disappear without explanation?
- Are faction goals consistent with their actions in each beat?
- Flag any setup-without-payoff: a character, faction, or secret introduced but never resolved.

#### Consequence Tracking
Do early player choices visibly affect later beats? Identify one moment where a prior choice pays off narratively, and one place where a prior choice should have consequences but doesn't.

#### Three Pillars Coverage
A table showing which beats cover which pillar:

| Beat | Act | Combat | Exploration | Roleplay |
|---|---|---|---|---|
| [Beat Name] | [Setup/Confrontation/Resolution] | ✓ / — | ✓ / — | ✓ / — |

Flag any pillar absent from the arc entirely, or any act that is all Combat with no Exploration or Roleplay.

#### Per-Beat Critique
For each beat in the arc:

- **Act Position** — Setup / Confrontation / Resolution / Unassigned
- **What Works** — the beat's strongest element
- **Issues Found** — specific structural, pacing, or agency problems
- **Suggested Fix** — one concrete change, implementable in under 30 minutes

#### Top 5 Priority Improvements
Ranked list of the five most impactful changes. Each item must be:
- Specific (names the beat, section, or element)
- Actionable (a DM can do it in a prep session)
- Ranked by impact, not by order of appearance in the arc

#### What's Working Well
2–3 specific strengths. Not general praise — name the beat, the choice, or the design element and explain why it works.

---

### Output Format

Format the review as Markdown with headers and subheaders suitable for use in Obsidian. No emojis. Bold beat names and NPC names on first mention.`;

export const arcReviewerPrompt: PromptDefinition = {
  name: "campaign_arc_reviewer",
  description:
    "Evaluate an existing D&D story arc against the six Design Principles used by Arc Builder, producing an " +
    "actionable critique with specific fixes (not a rewrite). Converted from the dm-campaign-builder skill's Arc Reviewer mode.",
  arguments: [
    {
      name: "arc_document",
      description: "The full arc document or a beat-by-beat summary — more detail produces more specific critique.",
      required: true,
    },
    { name: "party_level_range", description: "Helps calibrate CR and power-scale observations." },
    { name: "session_count", description: "Used to assess pacing density." },
    { name: "world_details", description: "Setting context that may explain unusual structural choices." },
  ],
  async handler(args) {
    const arcDocument = requireArg(args, "arc_document");
    const partyLevelRange = optionalArg(args, "party_level_range");
    const sessionCount = optionalArg(args, "session_count");
    const worldDetails = optionalArg(args, "world_details");

    const inputs = renderInputs([
      { label: "Party Level Range", value: partyLevelRange },
      { label: "Estimated Session Count", value: sessionCount },
      { label: "Campaign World Details", value: worldDetails },
    ]);

    const parts = [
      "# Arc to Review",
      "",
      arcDocument,
      "",
      inputs,
      "",
      INSTRUCTIONS,
    ];

    return { description: "Arc Reviewer — story arc critique", messages: userMessage(parts.join("\n")) };
  },
};
