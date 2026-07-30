import type { PromptDefinition } from "../../types.js";
import { optionalArg, renderInputs, requireArg, userMessage } from "./helpers.js";

/**
 * MCP prompt version of the `dm-campaign-builder` Claude Code skill's
 * "Faction Builder" mode — see D:\github\dm-toolkit\dm-campaign-builder\SKILL.md.
 * No live Geektastic Realms data is read; this is a static instructional
 * template (transcribed verbatim from that skill) plus the user's argument
 * values interpolated in. See ROADMAP.md Phase 8 "Campaign Builder prompts".
 */

const INSTRUCTIONS = `Produce a complete faction document in Markdown using the structure below, in order.
Write for a DM preparing for actual play: every section should be specific enough to
use at the table, not just evocative enough to inspire.

Maintain internal consistency throughout — leadership secrets should connect to the
faction's true purpose, weaknesses should feel like natural consequences of how the
faction operates, and adventure hooks should flow from the goals and relationships
already established.

---

#### Identity
- **Name & Common Alias** — what the faction calls itself vs. what others call them
- **Symbol or Sigil** — a brief visual description: colors, iconography, marks members use
- **Public Face** — what the faction claims to be or stand for
- **True Purpose** — what they are actually working toward; may match the public face or
  directly contradict it

The gap between public face and true purpose is one of the most useful levers for
player intrigue. If they are the same, make that clarity itself feel notable.

#### Leadership Structure

Three leaders at different tiers of the hierarchy:

- **Top Leader** — Name, race, title, and one sentence on how they hold power
- **Mid-Level Operator** — Name, race, role, and one sentence on what they manage day-to-day
- **Field Contact** — Name, race, role, and how players are most likely to first encounter them

Each leader carries one secret that creates internal tension or gives players a point
of leverage. Secrets should feel like they would actually matter — something that could
shift allegiances, expose weakness, or reframe the faction's actions.

#### Goals & Methods

**Short-Term Goals (current arc)**
2–3 things the faction is actively working on right now. These should be specific
enough that the DM can see them colliding with player actions in the near future.

**Long-Term Goals**
What the faction ultimately wants — power, survival, revenge, transformation of society,
or something stranger. This should feel like the answer to "why does this faction exist?"

**Methods**
How the faction operates: violence, bribery, information networks, political maneuvering,
blackmail, charity and goodwill, or some combination. Include one method they consider
off-limits and why — this boundary humanizes the faction and creates interesting edge
cases when players push against it.

#### Membership & Resources

- **Who Joins** — what kind of people are recruited, and why they join: desperation,
  ideology, opportunity, coercion, or something else
- **Membership Tiers** — 2–3 tiers from street-level member to trusted insider, and what
  distinguishes each (access, knowledge, risk, commitment)
- **Resources** — what the faction controls: money, weapons, information, political
  influence, safe houses, labor, magical assets
- **Weaknesses** — two internal or external vulnerabilities players could exploit; these
  should feel like genuine blind spots or pressure points, not arbitrary handicaps

#### Relationships with Other Factions

A relationship table covering at least 3 factions. If existing campaign factions were
provided above, include all of them. Fill remaining slots with generated factions that
make sense given the faction's type and territory.

| Faction | Relationship | Reason |
|---|---|---|
| [Name] | Ally / Rival / Enemy / Neutral / Complicated | [One sentence] |

At least one relationship should be "Complicated" — a faction that is neither a clean
ally nor a clean enemy, depending on circumstances or player choices.

#### Player Interaction Points

Three specific ways players might encounter or become involved with this faction:

- **First Contact** — how players first learn the faction exists or meet a member;
  make this feel like a natural event, not a recruitment cutscene
- **Point of Tension** — a situation where the faction's goals directly conflict with
  player interests; this should feel inevitable given the faction's goals, not contrived
- **Potential Alliance** — what the faction would offer players in exchange for help,
  and what they would ask for in return; the ask should carry some moral or practical weight

#### Adventure Hooks

Three quest seeds tied directly to this faction:

1. A hook where the players work *for* the faction
2. A hook where the players work *against* the faction
3. A hook where the faction's actions create a problem players must solve independently
   — without the faction being the primary adversary or patron

Each hook should be a situation, not a mission briefing. Describe what is happening and
let the DM build from there.

---

### Output Format

Format the full faction document as Markdown with headers and subheaders suitable for
use in Obsidian. Bold all proper names (characters, locations, factions) on first mention.
Use a Markdown table for the faction relationship section. No emojis.`;

const WORLD_INTEGRATION = `---

### Campaign World Integration

Using the campaign world details supplied above, weave the relevant setting elements into the output. Consider:
- How local power structures or factions shape the content
- Any cultural, religious, or political details specific to the setting
- World-specific constraints, lore, or flavor the user mentioned
- Unique setting elements that would distinguish this content from generic fantasy

Add this as its own \`#### Campaign World Integration\` section after Adventure Hooks.`;

export const factionBuilderPrompt: PromptDefinition = {
  name: "campaign_faction_builder",
  description:
    "Create a fully developed D&D organization — leadership, goals, methods, relationships, and player hooks — " +
    "that can function as ally, antagonist, or something in between. Converted from the dm-campaign-builder skill's Faction Builder mode.",
  arguments: [
    { name: "faction_name", description: "If omitted, one is generated." },
    {
      name: "faction_type",
      description:
        "Criminal Syndicate / Religious Order / Military Force / Trade Guild / Rebel Cell / Noble House / Cult / " +
        "Secret Society / Mercenary Company / Indigenous Community — combinations allowed.",
      required: true,
    },
    {
      name: "power_level",
      description:
        "Local (one city or town) / Regional (controls a territory) / National (major political player) / " +
        "Shadow (operates everywhere unseen).",
      required: true,
    },
    { name: "location", description: "Where the faction is based or most active.", required: true },
    {
      name: "relationship_to_players",
      description: "Ally / Antagonist / Neutral / Unknown — or a freeform description of something more complex.",
      required: true,
    },
    { name: "existing_factions", description: "Other campaign factions this one should have defined relationships with." },
    {
      name: "world_details",
      description:
        "Setting-specific lore, culture, religion, or constraints to weave in. Not listed in the source skill's own " +
        "input table for this mode, but its Campaign World Integration section clearly expects one — added here so that " +
        "section has something to trigger on, consistent with Arc/Module Builder.",
    },
  ],
  async handler(args) {
    const factionType = requireArg(args, "faction_type");
    const powerLevel = requireArg(args, "power_level");
    const location = requireArg(args, "location");
    const relationshipToPlayers = requireArg(args, "relationship_to_players");
    const factionName = optionalArg(args, "faction_name");
    const existingFactions = optionalArg(args, "existing_factions");
    const worldDetails = optionalArg(args, "world_details");

    const inputs = renderInputs([
      { label: "Faction Name", value: factionName ?? "(not given — generate one)" },
      { label: "Faction Type", value: factionType },
      { label: "Power Level", value: powerLevel },
      { label: "Primary Location or Territory", value: location },
      { label: "Relationship to Players", value: relationshipToPlayers },
      { label: "Existing Factions to Relate To", value: existingFactions },
      { label: "Campaign World Details", value: worldDetails },
    ]);

    const parts = [inputs, "", INSTRUCTIONS];
    if (worldDetails) parts.push("", WORLD_INTEGRATION);

    return { description: "Faction Builder — organization design", messages: userMessage(parts.join("\n")) };
  },
};
