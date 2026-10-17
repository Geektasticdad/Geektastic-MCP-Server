# Podcast Management Tools Reference

Every tool below is contributed by the **Podcast Management** connector, which
connects to the My Ministry Mission Podcast Management app (v2.18.0 or later).
An admin can enable or disable each tool individually under **Tools** (see
[Administrator Guide](02-Admin-Guide.md#tools)).

## Setting up the connection

1. In the Podcast Management app, go to **Admin → Settings → API Access** and
   create a token. Choose the user it acts as and its access:
   - **Read only** — Claude can look things up but never change anything.
   - **Read and write** — Claude can also create and update records and save
     production documents. Writes only work if the chosen user is an
     **admin** or **editor**.
   Copy the token (it starts with `pma_`). It is shown once.
2. In this server's Web UI, go to **Connections → Add connection**, choose
   **Podcast Management**, enter the app's root URL (for example
   `https://podcast.example.com`, no `/api` suffix) and the token.
3. The dashboard health check shows the app version, token access, and user.
   You can also call `pm_get_me`.

**What the API can't do:** delete episodes, series, guests, or recordings;
accept or reject guest intake submissions; or send email. Those stay in the
app on purpose.

**Clearing a field:** update tools change only the fields you send. Send
`null` to clear an optional field (for example `"series_id": null` removes an
episode from its series).

**Rich-text fields** (guest topic/faith/product details, research notes,
series description, recording call summary, notes) accept plain text or
Markdown, which becomes paragraphs, or HTML, which the app sanitizes.

## Account and lookups

| Tool | What it does |
|---|---|
| `pm_get_me` | Who the token acts as, its scope, and whether writes are allowed. |
| `pm_list_lookups` | Ids and labels for episode, guest, recording, and series statuses, guest tags, and production document types. |

## Producer

These need Podcast Management v2.19.0 or later.

| Tool | What it does |
|---|---|
| `pm_get_pipeline` | What needs attention: active episodes (most urgent first) with production stage, next step (`next.skill` is the podcast skill to run; `next.owner` is `claude`, `jason`, or `none`), blockers, and days until publish; guest work waiting; series context-log gaps; pending status suggestions. |
| `pm_list_status_suggestions` | Pending Stage Automation suggestions, optionally for one record. |
| `pm_apply_status_suggestion` | Apply one (changes the status). Claude only does this after Jason says yes. |
| `pm_dismiss_status_suggestion` | Dismiss one permanently. |

**Production stages** are worked out by the app from saved documents:
Planned → Researched → Outlined → Drafted → Ready to Record → Transcribed →
Staged → Live → Promoted. A theology review counts only if it passed and was
saved after the latest Claude-written script.

**Prompt:** *What needs my attention?* (`pm_whats_next`, group "Producer")
starts a pipeline review, using the podcast-producer skill when it's installed.

## Episodes

| Tool | What it does |
|---|---|
| `pm_list_episodes` | List episodes, highest number first. Filters: `q` (title or exact number), `status_id`, `series_id`. |
| `pm_get_episode` | Full episode: status, format, series, linked recording and guests, notes, Captivate fields, production document index, `production` (stage, next step, blockers), and pending status suggestions. |
| `pm_create_episode` | Create an episode. Only `episode_title` is required; number defaults to the next one, status to "In Progress". Set `episode_format` (`solo`, `series`, `guest`, `cohost`, `fellowship`) so the producer knows which skill builds it. |
| `pm_update_episode` | Change title, number, status, series, publish date, linked recording, or run time. |

Example: link episode 42 to recording 17 and schedule it.

```json
{ "id": 42, "changes": { "guest_recording_id": 17, "publish_date": "2026-11-04" } }
```

## Series

| Tool | What it does |
|---|---|
| `pm_list_series` | List series with status and episode count. |
| `pm_get_series` | Series description, episodes in order, notes, and document index. |
| `pm_create_series` | Create a series. Only `title` is required; status defaults to "Not Started". |
| `pm_update_series` | Change title, description, external link, or status. |
| `pm_get_series_context_log` | The **Series Context Log**: each episode's latest `context_log` document, most recent episode first, stacked into `log`. `missing` lists episodes without one. |

## Guests

| Tool | What it does |
|---|---|
| `pm_list_guests` | List guests by last name. Filters: `q` (name or email), `status_id`. |
| `pm_get_guest` | Full profile: contact info, links, favorite verse, faith journey, topic and product details, research notes, statuses, tags, recordings, notes, documents. |
| `pm_create_guest` | Create a guest (`first_name`, `last_name`, `email` required). |
| `pm_update_guest` | Change any profile field. `status_ids`, `tag_ids`, and `other_links` replace the whole list. |

## Recordings

| Tool | What it does |
|---|---|
| `pm_list_recordings` | List recording sessions, most recent first. Filters: `q`, `status_id`, `guest_id`. |
| `pm_get_recording` | Dates, status, guests, linked episode, interview call summary, notes, documents. |
| `pm_create_recording` | Create a recording (`title` and at least one `guest_ids`; the first guest is primary). |
| `pm_update_recording` | Change title, guests, status, dates, or the Guest Interview Call Summary. |

## Notes

| Tool | What it does |
|---|---|
| `pm_list_notes` | Notes on an episode, series, guest, or recording. |
| `pm_create_note` | Add a short note. Use `pm_save_document` for long outputs. |

## Production documents

Production documents are the saved outputs of the podcast AI skills: research
briefs, outlines, narratives, discussion guides, theology reviews, series
plans, context log entries, guest briefs, rundown emails, transcripts, and
publication packs. They appear in a **Production Documents** panel on the
record's page in the app, where they can be read, downloaded as `.md`, or
deleted.

| Tool | What it does |
|---|---|
| `pm_list_documents` | Documents on a record (no bodies). `latest: true` keeps only the newest version of each type. |
| `pm_get_document` | One document with its full body. |
| `pm_save_document` | Save a document. Saving the same `doc_type` on the same record again adds a new **version**; nothing is overwritten. `narrative` and `discussion_guide` are converted from Markdown to formatted text for the app's script editor (`[Speaker note: ...]` lines become speaker notes). |

Document types: `episode_ideas`, `research_brief`, `outline`, `narrative`,
`discussion_guide`, `theology_review`, `series_plan`, `series_consistency`,
`context_log`, `guest_research_brief`, `guest_call_brief`,
`guest_rundown_email`, `transcript`, `publication_stage`,
`publication_live`, `other`.

## Guest intake submissions (read-only)

| Tool | What it does |
|---|---|
| `pm_list_intake_submissions` | Submissions from the public guest intake form. Filter: `status` (`pending`, `accepted`, `rejected`). |
| `pm_get_intake_submission` | Everything the applicant entered. Good input for the podcast-guest-research skill. |
