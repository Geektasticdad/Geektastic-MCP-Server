import { z } from "zod";
import type { AppConnector, ConnectorConfig, HealthCheckResult, ToolDefinition } from "../types.js";
import { FamilyTreeClient, parseConfig } from "./client.js";

/**
 * Connector for Geektastic Family Tree's JSON API (see
 * geektastic-family-tree/docs/API.md). All routes live under `/api/v1/` on
 * the instance's root origin — the client always prepends `/api/v1` itself,
 * so `baseUrl` should be just the origin (no path suffix). Auth is a
 * per-user Bearer token from that user's Admin -> API Tokens panel (token
 * management there is admin-only as of Family Tree v0.25.0); it acts as
 * that user with their existing per-tree role (viewer/contributor/editor/
 * admin) *and* the token's own access level. Write endpoints require at
 * least editor role, and are rejected outright with 403 if the token itself
 * was created read-only (the recommended scope for this connector) or has
 * expired. A living person's private details are redacted for
 * viewer/contributor-role tokens (Family Tree v0.22.0).
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
  relationship_type: z
    .enum(["married", "unmarried", "civil_union", "unknown"])
    .optional()
    .describe(
      "What kind of couple they were — a family's parents weren't necessarily married. married shows them " +
        "as spouses; unmarried (unmarried partners), civil_union (civil union / domestic partnership) and " +
        "unknown show them as partners. Only set married when there's evidence of a marriage. Defaults to " +
        "unknown on create; adding a MARR event to an unknown family makes it married. Requires Family Tree " +
        "v2.1.2+ (ignored by older versions).",
    ),
});

const childRelationTypeSchema = z
  .enum(["birth", "adopted", "foster", "step", "no_relation", "unknown"])
  .describe(
    "no_relation means that parent isn't related to the child at all (the child stays linked into the " +
      "family, but is excluded from that side's pedigree/descendant/relationship calculations), distinct " +
      "from unknown (a relation exists but isn't known).",
  );

const addChildSchema = z.object({
  individual_id: z.coerce.number().int().optional().describe("Existing person to link as a child."),
  new_given: z.string().optional().describe("Given name for a brand-new child person (alternative to individual_id)."),
  new_surname: z.string().optional().describe("Surname for a brand-new child person."),
  father_relation: childRelationTypeSchema.optional(),
  mother_relation: childRelationTypeSchema.optional(),
});

const childRelationSchema = z.object({
  father_relation: childRelationTypeSchema.optional(),
  mother_relation: childRelationTypeSchema.optional(),
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

const researchPrioritySchema = z
  .enum(["low", "medium", "high"])
  .describe("Defaults to medium. Requires Family Tree v2.1.0+ (ignored by older versions).");

const researchDueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .nullable()
  .describe("YYYY-MM-DD; null clears it. Requires Family Tree v2.1.0+ (ignored by older versions).");

const researchTaskCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["open", "in_progress", "done"]).optional(),
  priority: researchPrioritySchema.optional(),
  due_date: researchDueDateSchema.optional(),
  individual_id: z.coerce.number().int().optional(),
  family_id: z.coerce.number().int().optional(),
  source_id: z.coerce.number().int().optional(),
  place_id: z.coerce.number().int().optional(),
  individual_ids: z
    .array(z.coerce.number().int())
    .optional()
    .describe(
      "Further people this task covers besides its one owner (e.g. every family member in a census " +
        "search) — the task then shows on each of their profiles. Requires Family Tree v2.1.0+.",
    ),
  source_ids: z
    .array(z.coerce.number().int())
    .optional()
    .describe("Further sources this task involves. Requires Family Tree v2.1.0+."),
});

const researchTaskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["open", "in_progress", "done"]).optional(),
  priority: researchPrioritySchema.optional(),
  due_date: researchDueDateSchema.optional(),
});

const searchAttemptSchema = z.object({
  source_id: z.coerce
    .number()
    .int()
    .optional()
    .describe("The source searched, if it's in the tree. Send this and/or description."),
  description: z
    .string()
    .max(255)
    .optional()
    .describe('What was searched, e.g. "1900 US Census, Cook County, Illinois". Send this and/or source_id.'),
  result: z.enum(["found", "not_found", "partial", "inconclusive"]),
  searched_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    .optional()
    .describe("Defaults to today."),
  notes: z.string().optional().describe("HTML; sanitized by Family Tree."),
});

const faceTagSchema = z.object({
  individual_id: z.coerce.number().int().describe("Who is in the box — a person in this tree."),
  x: z.coerce.number().min(0).max(1).describe("Left edge, as a fraction of the image width (0 = left)."),
  y: z.coerce.number().min(0).max(1).describe("Top edge, as a fraction of the image height (0 = top)."),
  w: z.coerce.number().min(0.02).max(1).describe("Box width as a fraction of the image width (at least 0.02)."),
  h: z.coerce.number().min(0.02).max(1).describe("Box height as a fraction of the image height (at least 0.02)."),
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
      "media, notes, citations, research_tasks, dna_matches, and relationship to the tree's home person. " +
      "research_tasks includes tasks linked to them as well as owned (is_owner 1/0), with attempt_count " +
      "and last_result of their logged searches. On Family Tree v2.1.0+ each media item also has face_tag " +
      "(where this person is in it, or null) and tagged_people (everyone tagged in it). " +
      "If this person is_living and the connection's token role is only viewer/contributor, the profile " +
      "comes back redacted (no events/media/notes, null birth/death dates) — same privacy rule as the web app.",
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
    "Create a family (couple), optionally with relationship_type (married/unmarried/civil_union/unknown). " +
      "husband_id/wife_id are both optional.",
    z.object({ tree_id: treeIdSchema, family: familyWriteSchema }),
    (i, cfg) => client(cfg).createFamily(i.tree_id, i.family),
  ),
  tool(
    "ft_get_family",
    "Full family detail: husband, wife, relationship_type (v2.1.2+), children, events (with citations), citations, " +
      "media, notes, research_tasks.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getFamily(i.tree_id, i.id),
  ),
  tool(
    "ft_update_family",
    "Update a family — only the fields you pass change: husband_id, wife_id, relationship_type.",
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
    "Update a child's father_relation/mother_relation (birth/adopted/foster/step/no_relation/unknown) " +
      "within a family — see the relation field's own description for what no_relation vs. unknown means.",
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
    "Fetch media metadata (title, dimensions, file_size, etc.) plus links, notes, tags (face tags — who " +
      "is in the photo and where; Family Tree v2.1.0+), and file_url (fetch that URL with the same bearer " +
      "token to get the raw image/PDF bytes).",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getMedia(i.tree_id, i.id),
  ),
  tool(
    "ft_delete_media",
    "Delete a media item and its underlying file on disk.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteMedia(i.tree_id, i.id),
  ),

  // --- Face tags (Family Tree v2.1.0+) ---------------------------------------
  tool(
    "ft_list_face_tags",
    "Who is tagged in a photo, and where: each tag has individual_id, name, and a box (x, y, w, h as " +
      "0–1 fractions of the image from its top-left corner). Requires Family Tree v2.1.0+.",
    z.object({ tree_id: treeIdSchema, media_id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).listFaceTags(i.tree_id, i.media_id),
  ),
  tool(
    "ft_tag_person_in_media",
    "Tag a person in a photo by the box around their face (x, y, w, h as 0–1 fractions of the image " +
      "from its top-left corner). One tag per person per photo — tagging someone already tagged moves " +
      "their box (moved: true). Also attaches the photo to that person, and a tagged face becomes their " +
      "profile picture if they have no primary photo. Only JPEG/PNG/GIF/WebP images can be tagged. Only " +
      "tag when you know where the person is in the image (e.g. from viewing it or the user describing " +
      "it) — don't guess coordinates. Requires Family Tree v2.1.0+.",
    z.object({ tree_id: treeIdSchema, media_id: z.coerce.number().int(), tag: faceTagSchema }),
    (i, cfg) => client(cfg).tagPersonInMedia(i.tree_id, i.media_id, i.tag),
  ),
  tool(
    "ft_delete_face_tag",
    "Remove a face tag (tag id from ft_list_face_tags). The photo stays attached to the person. " +
      "Requires Family Tree v2.1.0+.",
    z.object({ tree_id: treeIdSchema, media_id: z.coerce.number().int(), tag_id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteFaceTag(i.tree_id, i.media_id, i.tag_id),
  ),

  // --- Research log ------------------------------------------------------
  tool(
    "ft_list_research_tasks",
    "List research tasks. status defaults to active (open+in_progress); or open|in_progress|done|all. " +
      "Family Tree v2.1.0+ also filters by priority, overdue (due date passed, not done) and individual_id " +
      "(tasks owned by or linked to that person), returns attempt_count per task, and sorts by priority " +
      "then due date within each status.",
    z.object({
      tree_id: treeIdSchema,
      status: z.enum(["active", "open", "in_progress", "done", "all"]).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      overdue: z.boolean().optional(),
      individual_id: z.coerce.number().int().optional(),
    }),
    (i, cfg) =>
      client(cfg).listResearchTasks(i.tree_id, {
        status: i.status,
        priority: i.priority,
        overdue: i.overdue ? 1 : undefined,
        individual_id: i.individual_id,
      }),
  ),
  tool(
    "ft_create_research_task",
    "Create a research task, optionally attached to one owner (individual_id/family_id/source_id/" +
      "place_id) — omit all for a general tree-wide task. individual_ids/source_ids link further people " +
      "and sources the task covers (Family Tree v2.1.0+).",
    z.object({ tree_id: treeIdSchema, task: researchTaskCreateSchema }),
    (i, cfg) => client(cfg).createResearchTask(i.tree_id, i.task),
  ),
  tool(
    "ft_get_research_task",
    "Fetch a research task. Family Tree v2.1.0+ also returns linked_people, linked_sources (each with a " +
      "link_id for ft_unlink_research_task), search_attempts (the research log — check it before searching " +
      "a record again) and notes.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).getResearchTask(i.tree_id, i.id),
  ),
  tool(
    "ft_update_research_task",
    "Update a research task — only the fields you pass change (e.g. just status: done). Owner cannot be " +
      "changed; use ft_link_research_task to add people/sources.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), task: researchTaskUpdateSchema }),
    (i, cfg) => client(cfg).updateResearchTask(i.tree_id, i.id, i.task),
  ),
  tool(
    "ft_delete_research_task",
    "Delete a research task (and its links and search attempts).",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteResearchTask(i.tree_id, i.id),
  ),
  tool(
    "ft_link_research_task",
    "Link a further person (individual_id) or source (source_id) to a research task — pass exactly one. " +
      "The task then shows on their profile/page too. Linking the owner or an already-linked record is a " +
      "no-op. Returns the full task. Requires Family Tree v2.1.0+.",
    z.object({
      tree_id: treeIdSchema,
      id: z.coerce.number().int().describe("Research task id."),
      individual_id: z.coerce.number().int().optional(),
      source_id: z.coerce.number().int().optional(),
    }),
    (i, cfg) =>
      client(cfg).linkResearchTask(i.tree_id, i.id, { individual_id: i.individual_id, source_id: i.source_id }),
  ),
  tool(
    "ft_unlink_research_task",
    "Remove a linked person or source from a research task, by the link_id from ft_get_research_task's " +
      "linked_people/linked_sources. Requires Family Tree v2.1.0+.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), link_id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).unlinkResearchTask(i.tree_id, i.id, i.link_id),
  ),
  tool(
    "ft_log_search_attempt",
    "Record a search done for a research task — what was searched (source_id and/or description), when, " +
      "and the result, including not_found: a negative result is worth logging so the same records aren't " +
      "searched twice. Returns the full task. Requires Family Tree v2.1.0+.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int().describe("Research task id."), attempt: searchAttemptSchema }),
    (i, cfg) => client(cfg).logSearchAttempt(i.tree_id, i.id, i.attempt),
  ),
  tool(
    "ft_delete_search_attempt",
    "Delete a logged search attempt (id from ft_get_research_task's search_attempts). Requires Family " +
      "Tree v2.1.0+.",
    z.object({ tree_id: treeIdSchema, id: z.coerce.number().int(), attempt_id: z.coerce.number().int() }),
    (i, cfg) => client(cfg).deleteSearchAttempt(i.tree_id, i.id, i.attempt_id),
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
    "Data-quality report: unsourced_people, uncited_events, old_living_people, conflicting_dates. " +
      "Requires the connection's token to have editor/admin role on this tree (403 for viewer/contributor) " +
      "since this would otherwise reveal living people's ages.",
    z.object({ tree_id: treeIdSchema }),
    (i, cfg) => client(cfg).getGapsReport(i.tree_id),
  ),
  tool(
    "ft_get_duplicates_report",
    "Clusters of 2+ people sharing a name and a close-enough (or both-unknown) birth year. " +
      "Conservative on purpose (exact name match only, no fuzzy/soundex). Requires the connection's token " +
      "to have editor/admin role on this tree (403 for viewer/contributor) for the same reason as " +
      "ft_get_gaps_report.",
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
