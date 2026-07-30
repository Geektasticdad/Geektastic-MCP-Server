import type { PromptDefinition } from "../../types.js";
import { optionalArg, renderInputs, requireArg, userMessage } from "./helpers.js";

/**
 * MCP prompt version of the `dm-campaign-builder` Claude Code skill's
 * "Faction Reviewer" mode — see D:\github\dm-toolkit\dm-campaign-builder\SKILL.md.
 * No live Geektastic Realms data is read; this is a static instructional
 * template (transcribed verbatim from that skill) plus the user's argument
 * values interpolated in. See ROADMAP.md Phase 8 "Campaign Builder prompts".
 */

const INSTRUCTIONS = `Faction Reviewer evaluates the faction above against the quality standards used by
Faction Builder. It does not rewrite the faction — it produces an actionable critique
with specific, achievable fixes.

Produce a complete faction review in Markdown using the structure below, in order.
Cite specific sections, leaders, and secrets by name. Give fixes a DM can implement in
under 30 minutes. Generic observations are not useful.

---

#### Faction Overview Assessment
2–3 sentences: what the faction's premise is, its strongest quality, and its single biggest structural gap.

#### Identity Coherence
Evaluate the gap between public face and true purpose:
- Is the gap specific enough to generate player intrigue, or is it too vague to use?
- Does the symbol or sigil give the DM something concrete to describe at the table?
- Rate the overall identity: **Strong** (gap creates immediate dramatic potential) / **Adequate** (functional but generic) / **Weak** (gap is too small or too large to be useful)

If Weak or Adequate, give one specific fix.

#### Leadership Structure Assessment
Evaluate the three-tier hierarchy:
- Are the three tiers (Top Leader, Mid-Level Operator, Field Contact) distinct in function — could they be confused with each other?
- Does each leader's secret create internal tension or give players a usable point of leverage? Flag any secrets that are too vague, too low-stakes, or that don't connect to the faction's true purpose.
- Is the Field Contact — the player-facing entry point — specific enough to run cold?

Rate: **Strong** / **Adequate** / **Weak** for each tier. Give a specific fix for any Weak rating.

#### Goal and Method Consistency
- Do the short-term goals plausibly advance the long-term goal? Flag any short-term goals that feel disconnected from the faction's stated purpose.
- Do the methods match the faction's type, resources, and power level? A Local criminal syndicate using political maneuvering at national scale is a consistency gap.
- Is the off-limits method meaningful — does it create interesting edge cases when players push against it? Or is it arbitrary? A meaningful limit is one where violating it would cost the faction something real.

#### Membership and Resource Assessment
- Is the "who joins" description specific enough to inform how an NPC member would talk and act? Or is it a generic demographic?
- Are the membership tiers distinct enough that a player can meaningfully interact with each tier differently?
- Are the two weaknesses genuine blind spots — things the faction wouldn't see coming — or arbitrary handicaps added for balance? The best weaknesses are natural consequences of how the faction operates.

#### Faction Relationship Table Audit
- Is at least one relationship rated "Complicated"? If not, flag it — a faction with only clean allies and enemies is less useful at the table.
- Are the reasons for each relationship specific (names an event, a resource, a shared enemy) or generic ("they compete for territory")?
- Flag any relationship that could apply to any two factions of these types — it means the reason isn't load-bearing for this specific faction.

If other campaign factions were provided above, check whether those factions appear in the table and whether the stated relationship is consistent with those factions' own goals.

#### Player Interaction Quality
Rate each of the three interaction points:

| Interaction Point | Rating | Issue | Suggested Fix |
|---|---|---|---|
| First Contact | Strong / Adequate / Weak | — | — |
| Point of Tension | Strong / Adequate / Weak | — | — |
| Potential Alliance | Strong / Adequate / Weak | — | — |

- **First Contact**: does it feel like a natural event, or does it read like a recruitment cutscene?
- **Point of Tension**: does it feel inevitable given the faction's stated goals, or does it require contrivance?
- **Potential Alliance**: does the ask carry genuine moral or practical weight, or is it too easy to say yes?

#### Adventure Hook Assessment
Evaluate each of the three hooks (for/against/independent):
- Is each hook a **situation** (describing what is happening) rather than a **mission briefing** (telling players what to do)?
- Are all three hook types present? If one is missing, flag it and suggest a replacement.
- Do the hooks flow from the faction's established goals and relationships, or do they feel disconnected from the faction document?

#### Top 5 Priority Improvements
Ranked list of the five most impactful changes. Each item must:
- Name the specific section, leader, hook, or relationship
- State the problem
- Give a concrete fix implementable in under 30 minutes
- Be ranked by impact, not order of appearance

#### What's Working Well
2–3 specific strengths. Name the section, the design element, or the specific detail and explain why it works at the table.

---

### Output Format

Format the review as Markdown with headers and subheaders suitable for use in Obsidian. No emojis. Bold faction names and NPC names on first mention.`;

export const factionReviewerPrompt: PromptDefinition = {
  name: "campaign_faction_reviewer",
  description:
    "Evaluate an existing D&D faction document against the quality standards used by Faction Builder, producing " +
    "an actionable critique with specific fixes (not a rewrite). Converted from the dm-campaign-builder skill's Faction Reviewer mode.",
  arguments: [
    {
      name: "faction_document",
      description: "The full faction document or a section-by-section summary — more detail produces more specific critique.",
      required: true,
    },
    { name: "other_factions", description: "Existing campaign factions to assess the relationship table against." },
    { name: "world_details", description: "Setting context that may explain unusual structural choices." },
  ],
  async handler(args) {
    const factionDocument = requireArg(args, "faction_document");
    const otherFactions = optionalArg(args, "other_factions");
    const worldDetails = optionalArg(args, "world_details");

    const inputs = renderInputs([
      { label: "Other Campaign Factions", value: otherFactions },
      { label: "Campaign World Details", value: worldDetails },
    ]);

    const parts = [
      "# Faction to Review",
      "",
      factionDocument,
      "",
      inputs,
      "",
      INSTRUCTIONS,
    ];

    return { description: "Faction Reviewer — faction document critique", messages: userMessage(parts.join("\n")) };
  },
};
