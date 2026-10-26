import { z } from "zod";
import type { AppConnector, ConnectorConfig, HealthCheckResult, PromptDefinition, ToolDefinition } from "../types.js";
import { PodcastClient, parseConfig } from "./client.js";

/**
 * Connector for the My Ministry Mission Podcast Management app's JSON API
 * (see API.md in the podcast-management-app repo). All routes live under
 * `/api/v1/` on the app's root origin — the client prepends `/api/v1`, so
 * `baseUrl` is just the origin. Auth is a Bearer token from Admin ->
 * Settings -> API Access (prefix `pma_`); it acts as the user it was issued
 * for. Read-only tokens (or tokens owned by a viewer) get 403 on every write.
 *
 * Besides the CRUD tools, the key workflow tools are:
 * - pm_save_document: store a podcast skill's output (research brief,
 *   outline, narrative, theology review, publication pack, context log...)
 *   on an episode/series/guest/recording. Saving the same doc_type again
 *   adds a new version rather than overwriting.
 * - pm_get_series_context_log: the stacked Series Context Log for a series,
 *   built from each episode's latest context_log document.
 */

const configSchema = z.object({
  baseUrl: z
    .string()
    .url()
    .describe("Root origin of the Podcast Management app, e.g. https://podcast.example.com (no /api suffix)"),
  apiKey: z.string().min(1).describe("API token from Admin -> Settings -> API Access (prefix pma_)"),
});

const id = z.coerce.number().int().positive();
const page = z.coerce.number().int().positive().optional().describe("1-based page number (default 1).");
const perPage = z.coerce.number().int().min(1).max(100).optional().describe("Results per page, 1-100 (default 25).");
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .nullable()
  .optional()
  .describe("YYYY-MM-DD; null clears it.");

const entityType = z
  .enum(["episode", "series", "guest", "recording"])
  .describe("Which kind of record the document or note belongs to.");

const docType = z
  .enum([
    "episode_ideas",
    "research_brief",
    "outline",
    "narrative",
    "discussion_guide",
    "theology_review",
    "series_plan",
    "series_consistency",
    "context_log",
    "guest_research_brief",
    "call_transcript",
    "guest_call_brief",
    "guest_rundown_email",
    "transcript",
    "publication_stage",
    "publication_live",
    "other",
  ])
  .describe(
    "What the document is. Typical owners: episode_ideas/research_brief/outline/narrative/discussion_guide/" +
      "theology_review/context_log/transcript/publication_stage/publication_live on an episode; series_plan/" +
      "series_consistency on a series; guest_research_brief/guest_call_brief on a guest; call_transcript (the " +
      "intro call's Descript transcript, kept verbatim)/guest_call_brief/guest_rundown_email on a recording.",
  );

const richText =
  "Plain text or Markdown is fine (converted to paragraphs); HTML is accepted and sanitized. null clears it.";

const episodeFormat = z
  .enum(["solo", "series", "guest", "cohost", "fellowship"])
  .describe(
    "Which podcast skill builds the episode: solo → podcast-episode, series → podcast-series-production, " +
      "guest → podcast-guest-production, cohost → podcast-cohost, fellowship → podcast-fellowship-faith.",
  );

const episodeFields = z.object({
  episode_title: z.string().min(1).optional().describe("Must be unique across episodes."),
  episode_format: episodeFormat.nullable().optional(),
  episode_number: z.coerce
    .number()
    .int()
    .min(0)
    .nullable()
    .optional()
    .describe(
      "Must be unique. Omit on create to make a Draft (no number yet; assign it later in the app or here). " +
        "On update, null turns the episode back into a Draft.",
    ),
  episode_status_id: id.optional().describe("See pm_list_lookups.episode_statuses. On create, defaults to 'In Progress'."),
  series_id: id.nullable().optional().describe("Assign to a series (pm_list_series); null removes it from its series."),
  publish_date: date,
  guest_recording_id: id
    .nullable()
    .optional()
    .describe("Link this episode to a guest recording (pm_list_recordings); null unlinks it."),
  duration_seconds: z.coerce.number().int().min(0).nullable().optional().describe("Run time in seconds."),
});

const seriesFields = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional().describe(`Series description. ${richText}`),
  external_link: z.string().url().nullable().optional(),
  series_status_id: id
    .nullable()
    .optional()
    .describe("See pm_list_lookups.series_statuses. On create, defaults to 'Not Started'."),
});

const otherLink = z.object({ label: z.string().optional(), url: z.string().url() });

const guestFields = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  email: z.string().email().optional().describe("Must be unique across guests."),
  phone: z.string().nullable().optional(),
  time_zone: z.string().nullable().optional().describe("IANA name, e.g. America/Los_Angeles."),
  status_ids: z
    .array(id)
    .optional()
    .describe("Replaces ALL of the guest's statuses (pm_list_lookups.guest_statuses). On create, defaults to the first status."),
  tag_ids: z.array(id).optional().describe("Replaces ALL of the guest's tags (pm_list_lookups.guest_tags)."),
  bible_verse: z.string().nullable().optional().describe("The guest's favorite verse."),
  has_topic: z.boolean().optional(),
  topic_details: z.string().nullable().optional().describe(richText),
  great_guest: z.string().nullable().optional().describe(`Why they'd be a great guest / bio. ${richText}`),
  faith_journey: z.string().nullable().optional().describe(richText),
  willing_to_share: z.boolean().optional(),
  has_product: z.boolean().optional(),
  product_details: z.string().nullable().optional().describe(`Product, service, or event. ${richText}`),
  website: z.string().url().nullable().optional(),
  podcast: z.string().url().nullable().optional(),
  facebook: z.string().url().nullable().optional(),
  twitter: z.string().url().nullable().optional(),
  instagram: z.string().url().nullable().optional(),
  linkedin: z.string().url().nullable().optional(),
  youtube: z.string().url().nullable().optional(),
  headshot_logo_url: z.string().url().nullable().optional(),
  other_links: z.array(otherLink).nullable().optional().describe("Replaces the whole Other Links list."),
  guest_research: z
    .string()
    .nullable()
    .optional()
    .describe(
      `The guest profile's Research Notes field. ${richText} For a full podcast-guest-research brief, prefer ` +
        "pm_save_document (doc_type guest_research_brief) so earlier versions are kept.",
    ),
});

const recordingFields = z.object({
  title: z.string().min(1).optional(),
  guest_ids: z
    .array(id)
    .optional()
    .describe("Replaces all guests on the recording; the first id is the primary guest."),
  recording_status_id: id.nullable().optional().describe("See pm_list_lookups.recording_statuses."),
  interest_date: date,
  intro_call_date: date,
  recording_date: date,
  interview_call_summary: z
    .string()
    .nullable()
    .optional()
    .describe(
      `The recording's Guest Interview Call Summary field. ${richText} If pm_get_recording shows ` +
        "interview_call_summary_edited_in_app: true, Jason edited it himself: ask before replacing it.",
    ),
});

function toResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toErrorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function client(cfg: ConnectorConfig): PodcastClient {
  return new PodcastClient(parseConfig(cfg));
}

function tool<S extends z.ZodType>(
  name: string,
  description: string,
  inputSchema: S,
  run: (input: z.infer<S>, cfg: ConnectorConfig) => Promise<unknown>,
  extra: Pick<ToolDefinition, "category" | "access"> = {},
): ToolDefinition {
  return {
    name,
    description,
    inputSchema,
    ...extra,
    async handler(input, cfg) {
      try {
        const parsed = inputSchema.parse(input);
        return toResult(await run(parsed, cfg));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  };
}

function requireFields<T extends Record<string, unknown>>(obj: T, keys: (keyof T)[], what: string): void {
  const missing = keys.filter((k) => obj[k] === undefined || obj[k] === null || obj[k] === "");
  if (missing.length) throw new Error(`${what} requires: ${missing.join(", ")}`);
}

const tools: ToolDefinition[] = [
  // --- Account & lookups ---------------------------------------------------
  tool(
    "pm_get_me",
    "Who the connection's API token acts as (user, role), its scope (read or write), and whether writes are " +
      "allowed. Call this first if a write fails with 403.",
    z.object({}),
    (_i, cfg) => client(cfg).me(),
    { category: "Account" },
  ),
  tool(
    "pm_list_lookups",
    "Ids and labels for episode statuses, guest statuses, guest tags, recording statuses, series statuses, " +
      "production stages, guest workflow stages, email draft kinds, and the production document types. Use these " +
      "ids in the other tools.",
    z.object({}),
    (_i, cfg) => client(cfg).lookups(),
    { category: "Lookup" },
  ),

  // --- Producer ----------------------------------------------------------------
  tool(
    "pm_get_pipeline",
    "What needs attention across the show: active episodes (soonest and most urgent first) with production stage, " +
      "next step (`next.skill` is the podcast skill to run; `next.owner` is claude, jason, or none), blockers, and " +
      "days until publish (guest episodes on one merged track; `next2` is a second step when one is due, e.g. record " +
      "the episode and send the rundown); guests in progress (`guests.active`: each guest's workflow stage, from Accepted to " +
      "Thanked, with the same next/blockers shape), pending intake, recordings without an episode; email drafts " +
      "waiting for Jason's review; series context-log gaps; and pending status suggestions. Start here for " +
      "'what needs my attention?'.",
    z.object({}),
    (_i, cfg) => client(cfg).pipeline(),
    { category: "Pipeline", access: "read" },
  ),
  tool(
    "pm_list_status_suggestions",
    "Pending Stage Automation suggestions (e.g. 'Theology review passed → change status to Ready to Record'). " +
      "Optionally for one record.",
    z.object({ entity_type: z.enum(["episode", "recording", "guest"]).optional(), entity_id: id.optional() }),
    (i, cfg) => client(cfg).listStatusSuggestions(i),
    { category: "Status suggestion" },
  ),
  tool(
    "pm_apply_status_suggestion",
    "Apply a pending status suggestion (changes the record's status, or adds the guest status). Only after Jason " +
      "says yes to that specific suggestion.",
    z.object({ id }),
    (i, cfg) => client(cfg).resolveStatusSuggestion(i.id, "apply"),
    { category: "Status suggestion", access: "write" },
  ),
  tool(
    "pm_dismiss_status_suggestion",
    "Dismiss a pending status suggestion so it never comes back. Only when Jason asks.",
    z.object({ id }),
    (i, cfg) => client(cfg).resolveStatusSuggestion(i.id, "dismiss"),
    { category: "Status suggestion", access: "write" },
  ),

  // --- Episodes --------------------------------------------------------------
  tool(
    "pm_list_episodes",
    "List episodes, highest episode number first. Filter by text (title or exact number), status, or series.",
    z.object({
      q: z.string().optional(),
      status_id: id.optional(),
      series_id: id.optional(),
      page,
      per_page: perPage,
    }),
    (i, cfg) => client(cfg).listEpisodes(i),
  ),
  tool(
    "pm_get_episode",
    "One episode with its status, format, series, linked recording and guests, notes, Captivate fields (incl. " +
      "shownotes), an index of its production documents (bodies via pm_get_document), `production` (derived stage, " +
      "documents present, theology review result, next step with the skill to run, blockers), `guest_track` for a guest " +
      "episode (one track merging production with the guest's workflow, with next and next2), and any pending " +
      "`status_suggestions`.",
    z.object({ id }),
    (i, cfg) => client(cfg).getEpisode(i.id),
  ),
  tool(
    "pm_create_episode",
    "Create an episode. Only episode_title is required. Without episode_number it's a Draft: all pre-production " +
      "work (research, outline, script, review, recording) can happen before it gets a number and publish date, " +
      "which are only required before publishing. Set assign_next_number to give it the next number now. Status " +
      "defaults to 'In Progress'. Returns the new episode (is_draft tells you whether it has a number).",
    episodeFields.extend({
      episode_title: z.string().min(1),
      assign_next_number: z
        .boolean()
        .optional()
        .describe("Give the new episode the next number after the highest existing one, instead of making a Draft."),
    }),
    (i, cfg) => client(cfg).createEpisode(i),
  ),
  tool(
    "pm_update_episode",
    "Change an episode. Only the fields you send change; send null to clear an optional field.",
    z.object({ id, changes: episodeFields }),
    (i, cfg) => client(cfg).updateEpisode(i.id, i.changes),
  ),

  // --- Series ----------------------------------------------------------------
  tool(
    "pm_list_series",
    "List podcast series, newest first, with status and episode count.",
    z.object({ q: z.string().optional(), status_id: id.optional(), page, per_page: perPage }),
    (i, cfg) => client(cfg).listSeries(i),
  ),
  tool(
    "pm_get_series",
    "One series with its description, episodes (in episode order), notes, and production document index.",
    z.object({ id }),
    (i, cfg) => client(cfg).getSeries(i.id),
  ),
  tool(
    "pm_create_series",
    "Create a series (e.g. after podcast-series-design). Only title is required. Save the full series plan " +
      "afterwards with pm_save_document (entity_type series, doc_type series_plan).",
    seriesFields.extend({ title: z.string().min(1) }),
    (i, cfg) => client(cfg).createSeries(i),
  ),
  tool(
    "pm_update_series",
    "Change a series. Only the fields you send change.",
    z.object({ id, changes: seriesFields }),
    (i, cfg) => client(cfg).updateSeries(i.id, i.changes),
  ),
  tool(
    "pm_get_series_context_log",
    "The Series Context Log for podcast-series-production: `log` stacks the latest context_log document from " +
      "each episode in the series, most recent episode first. `missing` lists episodes that have no entry yet.",
    z.object({ id }),
    (i, cfg) => client(cfg).getSeriesContextLog(i.id),
    { category: "Series" },
  ),

  // --- Guests ----------------------------------------------------------------
  tool(
    "pm_list_guests",
    "List guests by last name. Filter by text (name or email) or by status.",
    z.object({ q: z.string().optional(), status_id: id.optional(), page, per_page: perPage }),
    (i, cfg) => client(cfg).listGuests(i),
  ),
  tool(
    "pm_get_guest",
    "One guest's full profile: contact info, links, favorite verse, faith journey, topic and product details, " +
      "research notes, statuses, tags, recordings, notes, production document index, email drafts, and " +
      "guest_stage (workflow stage for their latest recording, with the next step and blockers).",
    z.object({ id }),
    (i, cfg) => client(cfg).getGuest(i.id),
  ),
  tool(
    "pm_create_guest",
    "Create a guest. first_name, last_name, and email are required. To turn an intake submission into a guest, " +
      "ask Jason to accept it in the app instead (that keeps the intake record linked).",
    guestFields.extend({
      first_name: z.string().min(1),
      last_name: z.string().min(1),
      email: z.string().email(),
    }),
    (i, cfg) => client(cfg).createGuest(i),
  ),
  tool(
    "pm_update_guest",
    "Change a guest. Only the fields you send change; status_ids, tag_ids, and other_links replace the whole list.",
    z.object({ id, changes: guestFields }),
    (i, cfg) => client(cfg).updateGuest(i.id, i.changes),
  ),

  // --- Recordings --------------------------------------------------------------
  tool(
    "pm_list_recordings",
    "List guest recording sessions, most recent first. Filter by text, status, or guest.",
    z.object({
      q: z.string().optional(),
      status_id: id.optional(),
      guest_id: id.optional(),
      page,
      per_page: perPage,
    }),
    (i, cfg) => client(cfg).listRecordings(i),
  ),
  tool(
    "pm_get_recording",
    "One recording with its dates, status, guests, linked episode, interview call summary (and whether Jason " +
      "edited it in the app), notes, production document index, email drafts, and guest_stage (the primary " +
      "guest's workflow stage for this recording, with the next step and blockers).",
    z.object({ id }),
    (i, cfg) => client(cfg).getRecording(i.id),
  ),
  tool(
    "pm_create_recording",
    "Create a recording session. title and at least one guest id are required. Link it to an episode " +
      "afterwards with pm_update_episode (guest_recording_id).",
    recordingFields.extend({ title: z.string().min(1), guest_ids: z.array(id).min(1) }),
    (i, cfg) => client(cfg).createRecording(i),
  ),
  tool(
    "pm_update_recording",
    "Change a recording. Only the fields you send change. Use interview_call_summary to store the " +
      "podcast-guest-interview call summary on the recording (no need to ask first unless Jason edited it in the app).",
    z.object({ id, changes: recordingFields }),
    (i, cfg) => client(cfg).updateRecording(i.id, i.changes),
  ),

  // --- Notes -------------------------------------------------------------------
  tool(
    "pm_list_notes",
    "Notes on one episode, series, guest, or recording, oldest first.",
    z.object({ entity_type: entityType, entity_id: id }),
    (i, cfg) => client(cfg).listNotes(i.entity_type, i.entity_id),
  ),
  tool(
    "pm_create_note",
    "Add a short note to a record (shown in its Notes panel). For long skill outputs use pm_save_document.",
    z.object({ entity_type: entityType, entity_id: id, body: z.string().min(1).describe(richText) }),
    (i, cfg) => client(cfg).createNote(i),
  ),

  // --- Production documents --------------------------------------------------
  tool(
    "pm_list_documents",
    "Production documents on a record (no bodies). latest=true keeps only the newest version of each doc_type.",
    z.object({
      entity_type: entityType,
      entity_id: id,
      doc_type: docType.optional(),
      latest: z.boolean().optional(),
    }),
    (i, cfg) => client(cfg).listDocuments(i),
  ),
  tool(
    "pm_get_document",
    "One production document including its full body. Every document is rich text (body_format 'html'); set " +
      "as_text to get plain text instead (paragraphs separated by blank lines), which is much cheaper for " +
      "transcripts and long documents you only need to read.",
    z.object({
      id,
      as_text: z.boolean().optional().describe("Return the body as plain text instead of HTML."),
    }),
    (i, cfg) => client(cfg).getDocument(i.id, i.as_text ?? false),
  ),
  tool(
    "pm_save_document",
    "Save a podcast skill's output (Markdown or plain text, up to ~2 MB) on an episode, series, guest, or " +
      "recording. Saving the same doc_type on the same record again adds a new version; earlier versions are kept " +
      "and visible in the app's Production Documents panel. Every document is stored as rich text for the app's " +
      "editor: send Markdown (converted on save; in scripts, `[Speaker note: ...]` lines become speaker-note blocks), " +
      "or plain text for a transcript (kept verbatim). Saving a document re-checks the record's " +
      "production stage and Stage Automation rules. Returns the saved document with its version.",
    z.object({
      entity_type: entityType,
      entity_id: id,
      doc_type: docType,
      title: z.string().max(255).optional().describe("Defaults to the doc_type's label."),
      body: z.string().min(1),
    }),
    (i, cfg) => {
      requireFields(i, ["body"], "pm_save_document");
      return client(cfg).saveDocument(i);
    },
    { category: "Document", access: "write" },
  ),

  // --- Guest email drafts ----------------------------------------------------
  tool(
    "pm_create_email_draft",
    "Save a guest email for Jason to review. It is NEVER sent from here: it appears under Emails to Review in " +
      "the app, where Jason edits and sends it himself (returns review_url). kind: intro_invite (after a Book " +
      "verdict), decline (after Do Not Book), rundown (before recording, from podcast-guest-production), " +
      "thank_you (after recording), or other. Send the body as Markdown or plain text; merge tags like " +
      "{{first_name}} are filled in when Jason opens it. Give recording_id for rundown and thank_you emails; " +
      "guest_id defaults to the recording's primary guest.",
    z.object({
      kind: z.enum(["intro_invite", "decline", "rundown", "thank_you", "other"]),
      subject: z.string().min(1).max(500),
      body: z.string().min(1),
      guest_id: id.optional(),
      recording_id: id.optional(),
    }),
    (i, cfg) => {
      if (i.guest_id === undefined && i.recording_id === undefined) {
        throw new Error("pm_create_email_draft requires guest_id or recording_id");
      }
      return client(cfg).createEmailDraft(i);
    },
    { category: "Email draft", access: "write" },
  ),
  tool(
    "pm_list_email_drafts",
    "Guest email drafts (no bodies), newest first. Filter by status (draft = waiting for Jason's review, sent, " +
      "discarded), guest, or recording. Check this before drafting so you don't write the same email twice.",
    z.object({
      status: z.enum(["draft", "sent", "discarded"]).optional(),
      guest_id: id.optional(),
      recording_id: id.optional(),
    }),
    (i, cfg) => client(cfg).listEmailDrafts(i),
    { category: "Email draft", access: "read" },
  ),
  tool(
    "pm_get_email_draft",
    "One guest email draft with its full body.",
    z.object({ id }),
    (i, cfg) => client(cfg).getEmailDraft(i.id),
    { category: "Email draft", access: "read" },
  ),
  tool(
    "pm_list_email_templates",
    "Jason's saved email templates (subject and body) and the merge tags they can use. Start from a matching " +
      "template's wording and structure when drafting a guest email.",
    z.object({}),
    (_i, cfg) => client(cfg).listEmailTemplates(),
    { category: "Email draft", access: "read" },
  ),

  // --- Intake submissions (read-only) -------------------------------------
  tool(
    "pm_list_intake_submissions",
    "Guest intake form submissions, newest first. Accepting or rejecting happens in the app, not here.",
    z.object({ status: z.enum(["pending", "accepted", "rejected"]).optional(), page, per_page: perPage }),
    (i, cfg) => client(cfg).listIntakeSubmissions(i),
  ),
  tool(
    "pm_get_intake_submission",
    "One intake submission with everything the applicant entered (bio, faith journey, favorite verse, topic, " +
      "product, links). Good input for podcast-guest-research.",
    z.object({ id }),
    (i, cfg) => client(cfg).getIntakeSubmission(i.id),
  ),
];

const prompts: PromptDefinition[] = [
  {
    name: "pm_whats_next",
    title: "What needs my attention?",
    category: "Producer",
    description:
      "Review the podcast pipeline and pick what to work on next (uses the podcast-producer skill when it's installed).",
    async handler() {
      return {
        description: "Podcast producer: what needs attention",
        messages: [
          {
            role: "user",
            text:
              "What needs my attention on the podcast? Use the podcast-producer skill if it's available. Otherwise " +
              "call pm_get_pipeline and give me a short prioritized list: episodes whose next step is for Claude " +
              "(with the skill to run), things waiting on me, guest work, and pending status suggestions. Then ask " +
              "which one to work on. Don't change anything until I choose.",
          },
        ],
      };
    },
  },
];

export const podcastManagementConnector: AppConnector = {
  id: "podcast-management",
  displayName: "Podcast Management",
  configSchema,
  async healthCheck(cfg): Promise<HealthCheckResult> {
    try {
      const me = (await client(cfg).me()) as {
        user?: { name?: string; role?: string };
        token?: { scope?: string };
        app_version?: string;
      };
      const who = me.user?.name ? `${me.user.name} (${me.user.role ?? "?"})` : "unknown user";
      return { ok: true, detail: `v${me.app_version ?? "?"}, ${me.token?.scope ?? "?"} token as ${who}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },
  getTools(_cfg) {
    return tools;
  },
  getPrompts(_cfg) {
    return prompts;
  },
};
