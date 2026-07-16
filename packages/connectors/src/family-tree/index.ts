import { z } from "zod";
import type { AppConnector, ConnectorConfig, HealthCheckResult, ToolDefinition } from "../types.js";
import { FamilyTreeClient, parseConfig } from "./client.js";

/**
 * Connector for Geektastic Family Tree's JSON API (see
 * geektastic-family-tree/docs/API.md). All routes live under `/api/v1/` on
 * the instance's root origin — the client always prepends `/api/v1` itself,
 * so `baseUrl` should be just the origin (no path suffix). Auth is a
 * per-user Bearer token from that user's Account menu -> API Tokens panel;
 * it acts as that user with their existing per-tree role (viewer/
 * contributor/editor/admin). Write endpoints require at least editor.
 */

const configSchema = z.object({
  baseUrl: z
    .string()
    .url()
    .describe("Root origin of the Family Tree instance, e.g. https://tree.example.com (no /api suffix)"),
  apiKey: z
    .string()
    .min(1)
    .describe("Per-user API token from Account menu -> API Tokens (prefix gtk_)"),
});

const treeIdSchema = z.coerce.number().int().describe("Tree id — see ft_list_trees.");

const personWriteSchema = z.object({
  given: z.string().optional(),
  surname: z.string().optional(),
  sex: z.enum(["M", "F", "U"]).optional(),
  is_living: z.boolean().optional(),
});

const nameWriteSchema = z.object({
  name_type: z.enum(["birth", "married", "aka"]).optional(),
  npfx: z.string().optional(),
  given: z.string().optional(),
  nickname: z.string().optional(),
  spfx: z.string().optional(),
  surname: z.string().optional(),
  nsfx: z.string().optional(),
});

const familyWriteSchema = z.object({
  husband_id: z.coerce.number().int().nullable().optional(),
  wife_id: z.coerce.number().int().nullable().optional(),
});

const addChildSchema = z.object({
  individual_id: z.coerce.number().int().optional().describe("Existing person to link as a child."),
  new_given: z.string().optional().describe("Given name for a brand-new child person (alternative to individual_id)."),
  new_surname: z.string().optional().describe("Surname for a brand-new child person."),
  father_relation: z.enum(["birth", "adopted", "foster", "step", "unknown"]).optional(),
  mother_relation: z.enum(["birth", "adopted", "foster", "step", "unknown"]).optional(),
});

const childRelationSchema = z.object({
  father_relation: z.enum(["birth", "adopted", "foster", "step", "unknown"]).optional(),
  mother_relation: z.enum(["birth", "adopted", "foster", "step", "unknown"]).optional(),
});

const eventWriteSchema = z.object({
  individual_id: z.coerce.number().int().optional().describe("Owning person (mutually exclusive with family_id)."),
  family_id: z.coerce.number().int().optional().describe("Owning family (mutually exclusive with individual_id)."),
  tag: z
    .string()
    .optional()
    .describe("GEDCOM event code: BIRT/DEAT/MARR/DIV/RESI/CENS/OCCU/etc. Unrecognized codes fall back to EVEN."),
  custom_type: z.string().optional(),
  date: z.string().optional().describe("Free-text GEDCOM-style date, e.g. 'ABT 1805', 'BET 1964 AND 1966'."),
  place: z.string().optional().describe("Free-text place name — resolved or created by name."),
  place_id: z.coerce.number().int().optional().describe("Alternative to `place` — an existing place id."),
  cause: z.string().optional(),
  description: z.string().optional(),
});

const placeWriteSchema = z.object({
  full_name: z.string().min(1),
  place_type: z
    .enum([
      "borough",
      "building",
      "cemetery",
      "city",
      "continent",
      "country",
      "county",
      "department",
      "district",
      "farm",
      "hamlet",
      "locality",
      "municipality",
      "neighborhood",
      "parish",
      "province",
      "region",
      "residence",
      "state",
      "street",
      "town",
      "unknown",
      "village",
    ])
    .optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  parent_place_id: z.coerce.number().int().nullable().optional(),
});

const sourceWriteSchema = z.object({
  title: z.string().min(1),
  author: z.string().optional(),
  publisher: z.string().optional(),
  abbreviation: z.string().optional(),
  repository_id: z.coerce.number().int().nullable().optional(),
});

const repositoryWriteSchema = z.object({
  name: z.string().min(1),
  repository_type: z
    .enum(["album", "archive", "bookstore", "cemetery", "church", "collection", "library", "safe", "unknown", "website"])
    .optional(),
  www: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
});

const citationOwnerSchema = z.object({
  event_id: z.coerce.number().int().optional(),
  individual_id: z.coerce.number().int().optional(),
  family_id: z.coerce.number().int().optional(),
  note_id: z.coerce.number().int().optional(),
});

const citationCreateSchema = citationOwnerSchema.extend({
  source_id: z.coerce.number().int().optional().describe("Creates a new citation against this source."),
  page: z.string().optional(),
  quality: z.coerce.number().int().min(0).max(3).optional(),
  data_date: z.string().optional(),
  text: z.string().optional(),
  attach_citation_id: z
    .coerce.number()
    .int()
    .optional()
    .describe("Alternative to source_id: link an existing citation from this tree to the given owner instead."),
});

const citationUpdateSchema = z.object({
  source_id: z.coerce.number().int().optional().describe("Moves the citation to a different source."),
  page: z.string().optional(),
  quality: z.coerce.number().int().min(0).max(3).optional(),
  data_date: z.string().optional(),
  text: z.string().optional(),
});

const noteOwnerSchema = z.object({
  event_id: z.coerce.number().int().optional(),
  individual_id: z.coerce.number().int().optional(),
  family_id: z.coerce.number().int().optional(),
  source_id: z.coerce.number().int().optional(),
  repository_id: z.coerce.number().int().optional(),
  place_id: z.coerce.number().int().optional(),
  media_id: z.coerce.number().int().optional(),
  surname: z
    .string()
    .optional()
    .describe(
      "A surname string (e.g. \"McConnell\"), not an id — surnames aren't a table-backed entity, " +
        "this matches names.surname across the tree. Use instead of the id fields above to attach " +
        "a note to a surname as a research subject rather than one person.",
    ),
});

const noteCreateSchema = noteOwnerSchema.extend({
  body: z.string().min(1).describe("Sanitized HTML."),
  title: z.string().optional(),
  note_type: z.enum(["analysis", "citation", "general", "report", "research", "transcript"]).optional(),
});

const noteUpdateSchema = z.object({
  body: z.string().min(1),
  title: z.string().optional(),
  note_type: z.enum(["analysis", "citation", "general", "report", "research", "transcript"]).optional(),
});

const researchTaskCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["open", "in_progress", "done"]).optional(),
  individual_id: z.coerce.number().int().optional(),
  family_id: z.coerce.number().int().optional(),
  source_id: z.coerce.number().int().optional(),
  place_id: z.coerce.number().int().optional(),
});

const researchTaskUpdateSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["open", "in_progress", "done"]).optional(),
});

const dnaMatchCreateSchema = z.object({
  match_name: z.string().min(1),
  tested_individual_id: z.coerce.number().int().describe("Whose kit/test this is."),
  connection_individual_id: z.coerce.number().int().optional().describe("Believed shared-ancestor line."),
  match_individual_id: z.coerce.number().int().optional().describe("If the match is also a known person in this tree."),
  testing_company: z.enum(["ancestrydna", "23andme", "ftdna", "gedmatch", "myheritage", "other"]).optional(),
  shared_cm: z.number().optional(),
  shared_segments: z.coerce.number().int().optional(),
  estimated_relationship: z.string().optional(),
  notes: z.string().optional(),
});

const dnaMatchUpdateSchema = dnaMatchCreateSchema.partial().extend({
  match_name: z.string().optional(),
  tested_individual_id: z.coerce.number().int().optional(),
});

function toResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toErrorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function client(cfg: ConnectorConfig): FamilyTreeClient {
  return new FamilyTreeClient(parseConfig(cfg));
}

function tool<S extends z.ZodType>(
  name: string,
  description: string,
  inputSchema: S,
  run: (input: z.infer<S>, cfg: ConnectorConfig) => Promise<unknown>,
): ToolDefinition {
  return {
    name,
    description,
    inputSchema,
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

const tools: ToolDefinition[] = [
  // --- Trees ---------------------------------------------------------------
  tool("ft_list_trees", "List trees the token's user can access, with record counts.", z.object({}), (_i, cfg) =>
    client(cfg).listTrees(),
  ),
  tool(
    "ft_get_tree",
    "Fetch a single tree's detail: record counts + home_person.",
    z.object({ tree_id: treeIdSchema }),
    (i, cfg) => client(cfg).getTree(i.tree_id),
  ),
  tool(
    "ft_set_home_person",
    "Set (or clear, by omitting individual_id) a tree's home person — every person's profile then " +
      "includes their computed relationship to this person.",
    z.object({ tree_id: treeIdSchema, individual_id: z.coerce.number().int().nullable().optional() }),
    (i, cfg) => client(cfg).setHomePerson(i.tree_id, i.individual_id ?? null),
  ),

  // --- People ----------------------------------------------------------------
  tool(
    "ft_search_people",
    "Paginated list of people in a tree. Use q for a name search (capped by per_page, ignores " +
      "page/surname/sort), or surname/sort/dir/page/per_page to browse.",
    z.object({
      tree_id: treeIdSchema,
      q: z.string().optional(),
      surname: z.string().optional(),
      sort: z.enum(["name", "birth", "death", "sex"]).optional(),
      dir: z.enum(["asc", "desc"]).optional(),
      page: z.coerce.number().int().optional(),
      per_page: z.coerce.number().int().max(200).optional(),
    }),
    (i, cfg) => client(cfg).listPeople(i.tree_id, i),
  ),
  tool(
    "ft_create_person",
    "Create a new person in a tree. Response includes possible_duplicates from the same conservative " +
      "check the web app runs — check it before assuming the new person is actually new.",
    z.object({ tree_id: treeIdSchema, person: personWriteSchema }),
    (i, cfg) => client(cfg).createPerson(i.tree_id, i.person),
  ),
  tool(
    "ft_get_person",
    "Full profile for one person: names, events (with citations), parent/spouse families (resolved), " +
      "media, notes, citations, research_tasks, dna_matches, and relationship to the tree's home person.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getPerson(i.tree_id, i.id),
  ),
  tool(
    "ft_update_person",
    "Update a person's sex/is_living. Names are a sub-resource — use ft_add_name/ft_update_name.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), person: personWriteSchema }),
    (i, cfg) => client(cfg).updatePerson(i.tree_id, i.id, i.person),
  ),
  tool(
    "ft_delete_person",
    "Delete a person from a tree.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deletePerson(i.tree_id, i.id),
  ),
  tool(
    "ft_add_name",
    "Add a name (birth/married/aka) to a person.",
    z.object({ tree_id: treeIdSchema, person_id: z.coerce.number().int(), name: nameWriteSchema }),
    (i, cfg) => client(cfg).addName(i.tree_id, i.person_id, i.name),
  ),
  tool(
    "ft_update_name",
    "Update an existing name record by id.",
    z.object({ tree_id: treeIdSchema, name_id: z.coerce.number().int(), name: nameWriteSchema }),
    (i, cfg) => client(cfg).updateName(i.tree_id, i.name_id, i.name),
  ),
  tool(
    "ft_delete_name",
    "Delete a name record. Fails (422) if it's the person's only name.",
    z.object({ tree_id: treeIdSchema, name_id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteName(i.tree_id, i.name_id),
  ),
  tool(
    "ft_get_pedigree",
    "Nested { father, mother } ancestor tree for a person, 1-8 generations (default 6).",
    z.object({ tree_id: treeIdSchema, person_id: z.coerce.number().int(), generations: z.coerce.number().int().min(1).max(8).optional() }),
    (i, cfg) => client(cfg).getPedigree(i.tree_id, i.person_id, i.generations),
  ),
  tool(
    "ft_get_descendants",
    "Nested { families: [{ partner, children }] } descendant tree for a person, 1-6 generations (default 5).",
    z.object({ tree_id: treeIdSchema, person_id: z.coerce.number().int(), generations: z.coerce.number().int().min(1).max(6).optional() }),
    (i, cfg) => client(cfg).getDescendants(i.tree_id, i.person_id, i.generations),
  ),

  // --- Families ----------------------------------------------------------------
  tool(
    "ft_list_families",
    "Full list of families in a tree, with husband/wife names and child_count.",
    z.object({ tree_id: treeIdSchema }),
    (i, cfg) => client(cfg).listFamilies(i.tree_id),
  ),
  tool(
    "ft_create_family",
    "Create a family (couple). husband_id/wife_id are both optional.",
    z.object({ tree_id: treeIdSchema, family: familyWriteSchema }),
    (i, cfg) => client(cfg).createFamily(i.tree_id, i.family),
  ),
  tool(
    "ft_get_family",
    "Full family detail: husband, wife, children, events (with citations), citations, media, notes, research_tasks.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getFamily(i.tree_id, i.id),
  ),
  tool(
    "ft_update_family",
    "Update a family's husband_id/wife_id.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), family: familyWriteSchema }),
    (i, cfg) => client(cfg).updateFamily(i.tree_id, i.id, i.family),
  ),
  tool(
    "ft_delete_family",
    "Delete a family.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteFamily(i.tree_id, i.id),
  ),
  tool(
    "ft_add_child",
    "Link a child into a family — either an existing person (individual_id) or a brand-new person " +
      "(new_given/new_surname). Returns the family's updated children list.",
    z.object({ tree_id: treeIdSchema, family_id: z.coerce.number().int(), child: addChildSchema }),
    (i, cfg) => client(cfg).addChild(i.tree_id, i.family_id, i.child),
  ),
  tool(
    "ft_update_child_relation",
    "Update a child's father_relation/mother_relation (birth/adopted/foster/step/unknown) within a family.",
    z.object({
      tree_id: treeIdSchema,
      family_id: z.coerce.number().int(),
      individual_id: z.coerce.number().int(),
      relation: childRelationSchema,
    }),
    (i, cfg) => client(cfg).updateChildRelation(i.tree_id, i.family_id, i.individual_id, i.relation),
  ),
  tool(
    "ft_remove_child",
    "Remove a child link from a family (does not delete the person).",
    z.object({ tree_id: treeIdSchema, family_id: z.coerce.number().int(), individual_id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).removeChild(i.tree_id, i.family_id, i.individual_id),
  ),

  // --- Events ----------------------------------------------------------------
  tool(
    "ft_list_events",
    "List events in a tree, optionally filtered by individual_id or family_id (omit both for the whole tree).",
    z.object({ tree_id: treeIdSchema, individual_id: z.coerce.number().int().optional(), family_id: z.coerce.number().int().optional() }),
    (i, cfg) => client(cfg).listEvents(i.tree_id, i),
  ),
  tool(
    "ft_create_event",
    "Create an event on a person or a family (exactly one of individual_id/family_id).",
    z.object({ tree_id: treeIdSchema, event: eventWriteSchema }),
    (i, cfg) => client(cfg).createEvent(i.tree_id, i.event),
  ),
  tool(
    "ft_get_event",
    "Fetch one event, including citations and media.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getEvent(i.tree_id, i.id),
  ),
  tool(
    "ft_update_event",
    "Update an existing event.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), event: eventWriteSchema }),
    (i, cfg) => client(cfg).updateEvent(i.tree_id, i.id, i.event),
  ),
  tool(
    "ft_delete_event",
    "Delete an event.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteEvent(i.tree_id, i.id),
  ),

  // --- Places ----------------------------------------------------------------
  tool(
    "ft_list_places",
    "List places in a tree. q filters by name (LIKE, capped at 50); omit for the full flat list.",
    z.object({ tree_id: treeIdSchema, q: z.string().optional() }),
    (i, cfg) => client(cfg).listPlaces(i.tree_id, i.q),
  ),
  tool(
    "ft_create_place",
    "Create a place. latitude/longitude must both be set or both omitted.",
    z.object({ tree_id: treeIdSchema, place: placeWriteSchema }),
    (i, cfg) => client(cfg).createPlace(i.tree_id, i.place),
  ),
  tool(
    "ft_get_place",
    "Fetch a place, including children, events, notes, research_tasks.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getPlace(i.tree_id, i.id),
  ),
  tool(
    "ft_update_place",
    "Update a place.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), place: placeWriteSchema }),
    (i, cfg) => client(cfg).updatePlace(i.tree_id, i.id, i.place),
  ),
  tool(
    "ft_delete_place",
    "Delete a place. Children/events pointing here have the link cleared, not deleted.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deletePlace(i.tree_id, i.id),
  ),

  // --- Sources & repositories --------------------------------------------
  tool(
    "ft_list_sources",
    "List sources in a tree, with repository_name and citation_count.",
    z.object({ tree_id: treeIdSchema }),
    (i, cfg) => client(cfg).listSources(i.tree_id),
  ),
  tool(
    "ft_create_source",
    "Create a source.",
    z.object({ tree_id: treeIdSchema, source: sourceWriteSchema }),
    (i, cfg) => client(cfg).createSource(i.tree_id, i.source),
  ),
  tool(
    "ft_get_source",
    "Fetch a source, including citations, notes, media, links, research_tasks.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getSource(i.tree_id, i.id),
  ),
  tool(
    "ft_update_source",
    "Update a source.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), source: sourceWriteSchema }),
    (i, cfg) => client(cfg).updateSource(i.tree_id, i.id, i.source),
  ),
  tool(
    "ft_delete_source",
    "Delete a source. Citations referencing it cascade away.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteSource(i.tree_id, i.id),
  ),
  tool(
    "ft_list_repositories",
    "List repositories in a tree, with source_count.",
    z.object({ tree_id: treeIdSchema }),
    (i, cfg) => client(cfg).listRepositories(i.tree_id),
  ),
  tool(
    "ft_create_repository",
    "Create a repository.",
    z.object({ tree_id: treeIdSchema, repository: repositoryWriteSchema }),
    (i, cfg) => client(cfg).createRepository(i.tree_id, i.repository),
  ),
  tool(
    "ft_get_repository",
    "Fetch a repository, including notes and sources.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getRepository(i.tree_id, i.id),
  ),
  tool(
    "ft_update_repository",
    "Update a repository.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), repository: repositoryWriteSchema }),
    (i, cfg) => client(cfg).updateRepository(i.tree_id, i.id, i.repository),
  ),
  tool(
    "ft_delete_repository",
    "Delete a repository. Sources pointing here have repository_id cleared, not deleted.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteRepository(i.tree_id, i.id),
  ),

  // --- Citations ---------------------------------------------------------
  tool(
    "ft_list_citations",
    "List citations in a tree. q searches source title/page (capped 100); omit for a capped 200. " +
      "Each row includes owners: [{ label, url, type, id }, ...].",
    z.object({ tree_id: treeIdSchema, q: z.string().optional() }),
    (i, cfg) => client(cfg).listCitations(i.tree_id, i.q),
  ),
  tool(
    "ft_create_citation",
    "Create a citation attached to exactly one owner (event_id/individual_id/family_id/note_id). " +
      "Either give source_id (+ page/quality/data_date/text) to create a new citation, or " +
      "attach_citation_id to link an existing citation from this tree to the given owner instead.",
    z.object({ tree_id: treeIdSchema, citation: citationCreateSchema }),
    (i, cfg) => client(cfg).createCitation(i.tree_id, i.citation),
  ),
  tool(
    "ft_get_citation",
    "Fetch a citation, including owners, media, links.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getCitation(i.tree_id, i.id),
  ),
  tool(
    "ft_update_citation",
    "Update a citation. Editing one attached to more than one record changes it everywhere it's attached.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), citation: citationUpdateSchema }),
    (i, cfg) => client(cfg).updateCitation(i.tree_id, i.id, i.citation),
  ),
  tool(
    "ft_delete_citation",
    "Delete a citation entirely: removes every attachment and the citation itself.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteCitation(i.tree_id, i.id),
  ),
  tool(
    "ft_detach_citation",
    "Remove just one owner's attachment to a citation (owner: exactly one of event_id/individual_id/" +
      "family_id/note_id). If it was the citation's last attachment, the citation itself is deleted too " +
      "(response includes deleted: true/false).",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), owner: citationOwnerSchema }),
    (i, cfg) => client(cfg).detachCitation(i.tree_id, i.id, i.owner),
  ),

  // --- Notes ---------------------------------------------------------------
  tool(
    "ft_list_notes",
    "List notes for exactly one owner (event_id/individual_id/family_id/source_id/repository_id/" +
      "place_id/media_id/surname — pass exactly one). surname is a name string (e.g. \"McConnell\"), " +
      "not an id, for research notes about a surname as a whole rather than one person.",
    z.object({ tree_id: treeIdSchema, owner: noteOwnerSchema }),
    (i, cfg) => client(cfg).listNotes(i.tree_id, i.owner),
  ),
  tool(
    "ft_create_note",
    "Create a note attached to exactly one owner (or a surname string instead of an owner id, " +
      "for research notes about a whole surname line). body is sanitized HTML.",
    z.object({ tree_id: treeIdSchema, note: noteCreateSchema }),
    (i, cfg) => client(cfg).createNote(i.tree_id, i.note),
  ),
  tool(
    "ft_get_note",
    "Fetch a note, including citations attached to it.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getNote(i.tree_id, i.id),
  ),
  tool(
    "ft_update_note",
    "Update a note's body/title/note_type. Owner cannot be changed.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), note: noteUpdateSchema }),
    (i, cfg) => client(cfg).updateNote(i.tree_id, i.id, i.note),
  ),
  tool(
    "ft_delete_note",
    "Delete a note.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteNote(i.tree_id, i.id),
  ),

  // --- Media (metadata only; uploads happen in the web app) -----------------
  tool(
    "ft_list_media",
    "List media metadata for exactly one owner (individual_id/family_id/event_id/source_id/" +
      "citation_id), or omit all owner fields for every media item in the tree. Upload/replace are " +
      "multipart/form-data and are not exposed here — use the web app for those.",
    z.object({
      tree_id: treeIdSchema,
      individual_id: z.coerce.number().int().optional(),
      family_id: z.coerce.number().int().optional(),
      event_id: z.coerce.number().int().optional(),
      source_id: z.coerce.number().int().optional(),
      citation_id: z.coerce.number().int().optional(),
    }),
    (i, cfg) => client(cfg).listMedia(i.tree_id, i),
  ),
  tool(
    "ft_get_media",
    "Fetch media metadata (title, dimensions, file_size, etc.) plus links, notes, and file_url " +
      "(fetch that URL with the same bearer token to get the raw image/PDF bytes).",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getMedia(i.tree_id, i.id),
  ),
  tool(
    "ft_delete_media",
    "Delete a media item and its underlying file on disk.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteMedia(i.tree_id, i.id),
  ),

  // --- Research log ------------------------------------------------------
  tool(
    "ft_list_research_tasks",
    "List research tasks. status defaults to active (open+in_progress); or open|in_progress|done|all.",
    z.object({ tree_id: treeIdSchema, status: z.enum(["active", "open", "in_progress", "done", "all"]).optional() }),
    (i, cfg) => client(cfg).listResearchTasks(i.tree_id, i.status),
  ),
  tool(
    "ft_create_research_task",
    "Create a research task, optionally attached to one owner (individual_id/family_id/source_id/" +
      "place_id) — omit all for a general tree-wide task.",
    z.object({ tree_id: treeIdSchema, task: researchTaskCreateSchema }),
    (i, cfg) => client(cfg).createResearchTask(i.tree_id, i.task),
  ),
  tool(
    "ft_get_research_task",
    "Fetch a research task.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getResearchTask(i.tree_id, i.id),
  ),
  tool(
    "ft_update_research_task",
    "Update a research task's title/description/status. Owner cannot be changed.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), task: researchTaskUpdateSchema }),
    (i, cfg) => client(cfg).updateResearchTask(i.tree_id, i.id, i.task),
  ),
  tool(
    "ft_delete_research_task",
    "Delete a research task.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteResearchTask(i.tree_id, i.id),
  ),

  // --- DNA matches -----------------------------------------------------------
  tool(
    "ft_list_dna_matches",
    "List DNA matches in a tree, sorted by shared_cm descending.",
    z.object({ tree_id: treeIdSchema }),
    (i, cfg) => client(cfg).listDnaMatches(i.tree_id),
  ),
  tool(
    "ft_create_dna_match",
    "Record a DNA match. tested_individual_id is required (whose kit/test this is — cM is meaningless " +
      "without it); connection_individual_id is the believed shared-ancestor line; match_individual_id " +
      "links it to a known person in this tree if the match has been identified.",
    z.object({ tree_id: treeIdSchema, match: dnaMatchCreateSchema }),
    (i, cfg) => client(cfg).createDnaMatch(i.tree_id, i.match),
  ),
  tool(
    "ft_get_dna_match",
    "Fetch a DNA match.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getDnaMatch(i.tree_id, i.id),
  ),
  tool(
    "ft_update_dna_match",
    "Update a DNA match.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), match: dnaMatchUpdateSchema }),
    (i, cfg) => client(cfg).updateDnaMatch(i.tree_id, i.id, i.match),
  ),
  tool(
    "ft_delete_dna_match",
    "Delete a DNA match.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteDnaMatch(i.tree_id, i.id),
  ),

  // --- Research tools ------------------------------------------------------
  tool(
    "ft_search",
    "Typeahead-style person name search. Returns [{ id, name, birth_sort, death_sort, is_living }].",
    z.object({ tree_id: treeIdSchema, q: z.string().min(1) }),
    (i, cfg) => client(cfg).search(i.tree_id, i.q),
  ),
  tool(
    "ft_get_relationship",
    "How two people are related, via the pedigree closure table. label is phrased as \"to's " +
      "relationship to from\" (e.g. \"grandchild\", \"1st cousin, 2 times removed\").",
    z.object({ tree_id: treeIdSchema, from: z.coerce.number().int(), to: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getRelationship(i.tree_id, i.from, i.to),
  ),
  tool(
    "ft_get_gaps_report",
    "Data-quality report: unsourced_people, uncited_events, old_living_people, conflicting_dates.",
    z.object({ tree_id: treeIdSchema }),
    (i, cfg) => client(cfg).getGapsReport(i.tree_id),
  ),
  tool(
    "ft_get_duplicates_report",
    "Clusters of 2+ people sharing a name and a close-enough (or both-unknown) birth year. " +
      "Conservative on purpose (exact name match only, no fuzzy/soundex).",
    z.object({ tree_id: treeIdSchema }),
    (i, cfg) => client(cfg).getDuplicatesReport(i.tree_id),
  ),
];

export const familyTreeConnector: AppConnector = {
  id: "family-tree",
  displayName: "Geektastic Family Tree",
  configSchema,
  async healthCheck(cfg): Promise<HealthCheckResult> {
    try {
      const result = await client(cfg).listTrees();
      const count = Array.isArray(result?.data) ? result.data.length : 0;
      return { ok: true, detail: `${count} tree${count === 1 ? "" : "s"} accessible` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },
  getTools(_cfg) {
    return tools;
  },
};
