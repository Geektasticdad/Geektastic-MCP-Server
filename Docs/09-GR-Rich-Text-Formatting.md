# Geektastic Realms Rich-Text Formatting

Several Geektastic Realms tools accept a `body_html`/`text`/prose field —
section content, handout bodies, entry bodies, encounter setup/tactics/
rewards/notes, session log summaries, quest/secret descriptions, history
event bodies, and roll table row descriptions. All of them are stored the
same way: as sanitized HTML. This page is the one place that convention is
written down in full — every field's own schema description just points back
here (or repeats a short version of it) rather than restating it.

Geektastic Realms' web app has a block editor with a `/` slash-command menu
that inserts headings, lists, tables, and a handful of GR-specific styled
blocks. The sanitizer that cleans incoming HTML (an HTMLPurifier allow-list)
happens to preserve every tag and class the block editor itself produces —
so writing that exact HTML through an MCP tool renders **identically** to a
human picking it from the slash menu. Nothing here is a special MCP-only
feature; it's just how to reach the same formatting a DM already has.

## Plain formatting

These render exactly as you'd expect, no special markup needed:

| Slash-menu item | HTML |
|---|---|
| Heading 1 / 2 / 3 | `<h1>`, `<h2>`, `<h3>` |
| Paragraph | `<p>` |
| Bullet List | `<ul><li>...</li></ul>` |
| Numbered List | `<ol><li>...</li></ol>` |
| Quote | `<blockquote>` |
| Table | `<table><thead>...</thead><tbody><tr><td>...</td></tr></tbody></table>` |
| Divider | `<hr>` |
| Image | `<img src="...">` — must already be hosted somewhere reachable; these tools have no upload endpoint, so this only works with a URL you already have (e.g. one returned elsewhere, or an external image). |

`<a>`, `<strong>`/`<b>`, `<em>`/`<i>`, `<u>`, `<s>`, `<sub>`, `<sup>` all work
inline as well.

**Checklist is the one exception.** The web editor's checklist relies on
`data-*` attributes (`data-checked`, plus an `<input type="checkbox">`) that
aren't in the sanitizer's allow-list — they get stripped on save, and the
checkbox state is lost. Use a plain bullet list instead if you need a
checklist-shaped list of items.

## Callout blocks (all six work in any of the fields listed above)

The block editor's six styled callouts are just wrapper `<div>`s with a
specific class. Since the sanitizer allow-lists `div[class]`, any of these
survive untouched in any rich-text field, not just section bodies:

| Slash-menu item | HTML | Renders as |
|---|---|---|
| Read Aloud | `<div class="read-aloud">...</div>` | Blue, italic — text meant to be read aloud to players |
| DM Note | `<div class="dm-note">...</div>` | Purple — a private reminder for the DM |
| Encounter Block | `<div class="encounter-block">...</div>` | Red-accented bordered box — a free-text encounter reference (not the same as an *embedded* encounter card, see below) |
| Treasure | `<div class="treasure-block">...</div>` | Gold — rewards and loot |
| Boxed Text | `<div class="boxed-text">...</div>` | Neutral bordered box |
| DM Secret | `<div class="dm-secret">...</div>` | Red — **automatically hidden on every public-facing page**, so it's always safe to include DM-only content this way |

Example — a scene opening with read-aloud text followed by a DM-only note:

```html
<div class="read-aloud">
  <p>The iron door groans open, revealing a chamber lit by a single guttering
  torch. Dust motes hang in the still air.</p>
</div>
<div class="dm-note">
  <p>If the party searches the far wall, they find the hidden lever from
  Scene 2 — see the Boxed Text below for the trap it disarms.</p>
</div>
```

## Reference-embed blocks (section `body_html` only)

Four more `div` classes expand into live, styled cards — but **only when
rendered as part of a section's own `body_html`** (via `gr_create_section` /
`gr_update_section`), through `gr_get_section` and the module's run view.
Used anywhere else (a handout body, a quest description, a session summary)
they still survive sanitization but just sit there as inert text — no card,
no expansion.

| Slash-menu item | HTML | Notes |
|---|---|---|
| Insert Encounter | `<div class="encounter-ref eid-{ID}">Name</div>` | `{ID}` must be an encounter already created in **this same module** (`gr_create_encounter`) |
| Insert Handout | `<div class="handout-ref hid-{ID}">Title</div>` | `{ID}` must be a handout already created in this module (`gr_create_handout`) |
| Insert Roll Table | `<div class="roll-table-ref rtid-{ID}">Title</div>` | `{ID}` must be a roll table already created in this module, or a world-level library table (`gr_create_roll_table`) |
| Insert Quest | `<div class="quest-ref qid-{ID} qkind-quest">Title</div>` | `{ID}` must be a quest/secret item already created in this module or its campaign (`gr_create_quest_item`); use `qkind-secret` instead of `qkind-quest` if the item's `kind` is `secret` |

The text inside the `div` is a fallback label — GR replaces it with the real
card (name, stats, description, etc.) at render time by looking up `{ID}`, so
it doesn't need to be exact, but keep it readable in case rendering ever
falls back to it.

**Workflow:** create the encounter/handout/roll table/quest item first (its
own `gr_create_*` tool returns the new id), *then* write the section body
referencing that id. Embedding an id that doesn't exist in the module simply
renders nothing where the card would be.

Example — a scene that read-aloud-opens into a fight, with the actual
encounter embedded rather than described inline:

```html
<div class="read-aloud">
  <p>Three goblins leap from the underbrush, blades drawn!</p>
</div>
<div class="encounter-ref eid-42">Goblin Ambush</div>
```

## Where this applies

- **Full support, including reference embeds:** `gr_create_section` /
  `gr_update_section`'s `body_html`.
- **Plain formatting + all six callouts, no reference embeds:**
  `gr_create_entry` / `gr_update_entry`'s `body_html`; `gr_create_module` /
  `gr_update_module`'s `overview`; `gr_create_handout` /
  `gr_update_handout`'s `body_html`.
- **Callouts supported, but these tend to hold shorter free text:**
  `gr_create_encounter` / `gr_update_encounter`'s `setup`/`tactics`/
  `rewards`/`notes`; `gr_create_session` / `gr_update_session`'s `summary`/
  `notes`/`next_session_prep`/`player_recap`; `gr_create_quest_item` /
  `gr_update_quest_item`'s `text`; `gr_create_era`/`gr_update_era`'s and
  history event tools' `body_html`; a roll table row's `description`.

If a tool isn't listed here, assume its text fields are plain strings with no
special formatting (e.g. `title`, `summary`, `level_range`).
