# Geektastic Family Tree Tools Reference

Every tool below is contributed by the **Geektastic Family Tree** connector. An
admin can enable/disable each one individually under **Tools** (see
[Administrator Guide](02-Admin-Guide.md#tools)) — if a tool you expect isn't
showing up for your MCP client, check there first.

The connection's API key is a per-user token (Account menu → API Tokens in the
Family Tree web app), so every tool call acts as that user — including their
per-tree role (viewer/contributor/editor/admin). Read tools (`ft_list_*`,
`ft_get_*`, `ft_search*`) need any role; write tools need at least **editor**
on the tree.

Almost every tool takes a `tree_id` — get valid ids from `ft_list_trees` first.

## Trees

| Tool | What it does |
|---|---|
| `ft_list_trees` | List trees the connection's user can access, with record counts. |
| `ft_get_tree` | Fetch one tree's detail: counts + its home person. |
| `ft_set_home_person` | Set (or clear) a tree's **home person** — the "center of gravity" that every person's profile shows their relationship to. |

## People

The richest set — start here for research.

| Tool | What it does |
|---|---|
| `ft_search_people` | Paginated browse/search of everyone in a tree (`q` for name search, or `surname`/`sort`/`dir`/`page`/`per_page` to browse). |
| `ft_create_person` | Add a new person. The response includes `possible_duplicates` from a conservative name+birth-year check — worth checking before assuming the person is new. |
| `ft_get_person` | Full profile: names, life events (with citations), parent/spouse families, media, notes, citations, open research tasks, DNA matches, and relationship to the tree's home person. |
| `ft_update_person` | Update sex/is_living. |
| `ft_delete_person` | Delete a person. |
| `ft_add_name` / `ft_update_name` / `ft_delete_name` | Manage a person's names — birth, married, or aka. A person always needs at least one. |
| `ft_get_pedigree` | Nested ancestor tree (father/mother), 1-8 generations back. |
| `ft_get_descendants` | Nested descendant tree (partners + children), 1-6 generations forward. |

## Families

A family is a couple (husband/wife, either optional) plus their children.

| Tool | What it does |
|---|---|
| `ft_list_families` | List every family in a tree. |
| `ft_create_family` | Create a family. |
| `ft_get_family` | Full detail: husband, wife, children, events, citations, media, notes, research tasks. |
| `ft_update_family` | Change who the husband/wife are. |
| `ft_delete_family` | Delete a family. |
| `ft_add_child` | Link a child into a family — either an existing person or a brand-new one created on the spot. |
| `ft_update_child_relation` | Set a child's relation to each parent (birth/adopted/foster/step/unknown). |
| `ft_remove_child` | Unlink a child from a family (doesn't delete the person). |

## Events

Life events (births, deaths, marriages, census records, etc.), each owned by
either a person or a family.

| Tool | What it does |
|---|---|
| `ft_list_events` | List events, optionally filtered to one person or family. |
| `ft_create_event` | Add an event — a GEDCOM tag (`BIRT`/`DEAT`/`MARR`/`RESI`/`CENS`/...), free-text date and place, cause, description. |
| `ft_get_event` | Fetch one event with its citations and media. |
| `ft_update_event` / `ft_delete_event` | Edit or remove an event. |

## Places

| Tool | What it does |
|---|---|
| `ft_list_places` | List/search places by name. |
| `ft_create_place` | Add a place, optionally geocoded (latitude+longitude) and/or nested under a parent place. |
| `ft_get_place` | Fetch a place with its children, events, notes, research tasks. |
| `ft_update_place` / `ft_delete_place` | Edit or remove a place. Deleting clears the link on anything pointing to it rather than cascading. |

## Sources & repositories

| Tool | What it does |
|---|---|
| `ft_list_sources` / `ft_create_source` / `ft_get_source` / `ft_update_source` / `ft_delete_source` | Manage sources (a census record, a book, a website, etc.) that citations point at. |
| `ft_list_repositories` / `ft_create_repository` / `ft_get_repository` / `ft_update_repository` / `ft_delete_repository` | Manage repositories (archives, libraries, websites) that sources belong to. |

## Citations

A citation (page, quality 0–3, transcribed text) ties a source to one owner —
an event, a person, a family, or a note — and can be shared across owners.

| Tool | What it does |
|---|---|
| `ft_list_citations` | Search/list citations, each showing everything it's attached to. |
| `ft_create_citation` | Attach a citation to one owner — either create it fresh against a source, or link an existing citation from the tree. |
| `ft_get_citation` | Fetch a citation with its owners, media, links. |
| `ft_update_citation` | Edit a citation (changes it everywhere it's attached, if shared). |
| `ft_delete_citation` | Delete a citation and every attachment it has. |
| `ft_detach_citation` | Remove just one owner's attachment; if that was the only one, the citation itself is deleted too. |

## Notes

Free-text notes attached to exactly one thing — an event, person, family,
source, repository, place, media item, or **surname**.

| Tool | What it does |
|---|---|
| `ft_list_notes` | List notes for one owner (pass exactly one owner field). |
| `ft_create_note` | Add a note (HTML body) to one owner. |
| `ft_get_note` / `ft_update_note` / `ft_delete_note` | Fetch, edit, or remove a note. |

Surname notes are the odd one out: pass `surname` (a plain name string like
`"McConnell"`) instead of one of the `*_id` owner fields, for research notes
about a whole surname line rather than one person — e.g. "the McConnell line
emigrated from Ulster in the 1850s." There's no surname entity/id; it's
matched against everyone's `names.surname` in the tree.

## Media

Photo/document **metadata** only — uploading or replacing the underlying file
is a multipart file upload and isn't exposed as a tool; do that in the web
app. Once a file exists, these tools can read its metadata (including
`file_url`, fetchable with the same bearer token) or delete it.

| Tool | What it does |
|---|---|
| `ft_list_media` | List media for one owner, or the whole tree if no owner is given. |
| `ft_get_media` | Fetch one media item's metadata + `file_url`. |
| `ft_delete_media` | Delete a media item and its file. |

## Research log

An open question or to-do, optionally attached to a person/family/source/place.

| Tool | What it does |
|---|---|
| `ft_list_research_tasks` | List tasks, filtered by status (defaults to open + in_progress). |
| `ft_create_research_task` / `ft_get_research_task` / `ft_update_research_task` / `ft_delete_research_task` | Manage a task. |

## DNA matches

Tracks a testing service's match list (name, shared cM, estimated
relationship) — never raw genotype data.

| Tool | What it does |
|---|---|
| `ft_list_dna_matches` | List matches, sorted by shared cM descending. |
| `ft_create_dna_match` | Record a match against a specific person's test kit. |
| `ft_get_dna_match` / `ft_update_dna_match` / `ft_delete_dna_match` | Manage a match. |

## Research tools

| Tool | What it does |
|---|---|
| `ft_search` | Fast typeahead person-name search — returns id, name, birth/death sort keys, is_living. |
| `ft_get_relationship` | How two people are related (e.g. "1st cousin, 2 times removed"), via the tree's precomputed pedigree closure. |
| `ft_get_gaps_report` | Data-quality report: unsourced people, uncited events, old living people, conflicting dates. |
| `ft_get_duplicates_report` | Clusters of likely-duplicate people (same name, close birth year). Conservative — exact name match only. |
