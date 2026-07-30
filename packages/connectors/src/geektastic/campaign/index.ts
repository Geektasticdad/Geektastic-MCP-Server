import type { PromptDefinition } from "../../types.js";
import { arcBuilderPrompt } from "./arcBuilder.js";
import { arcReviewerPrompt } from "./arcReviewer.js";
import { factionBuilderPrompt } from "./factionBuilder.js";
import { factionReviewerPrompt } from "./factionReviewer.js";
import { moduleBuilderPrompt } from "./moduleBuilder.js";
import { moduleReviewerPrompt } from "./moduleReviewer.js";

/**
 * MCP prompts converting the `dm-campaign-builder` Claude Code skill's six
 * modes into standalone, argument-driven MCP prompts — usable from any MCP
 * client, not just Claude Code, and without that client needing the skill
 * installed. See ROADMAP.md Phase 8 "Campaign Builder prompts" and
 * Tech_Docs/07-Connector-SDK.md "Campaign Builder prompts".
 *
 * Unlike ../prompts.ts's prompts, none of these call the Geektastic Realms
 * REST API — each is a static instructional template (transcribed verbatim
 * from the source skill's SKILL.md) plus the caller's argument values
 * interpolated in. Bundled onto the geektastic-realms connector rather than a
 * new connector so using them needs no extra field-less "connection" in the
 * dashboard beyond what a DM already sets up for the gr_* tools/prompts.
 */
export function getCampaignBuilderPrompts(): PromptDefinition[] {
  return [
    arcBuilderPrompt,
    arcReviewerPrompt,
    factionBuilderPrompt,
    factionReviewerPrompt,
    moduleBuilderPrompt,
    moduleReviewerPrompt,
  ];
}
