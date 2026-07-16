import type { ConnectorConfig } from "../types.js";

export interface FamilyTreeConfig {
  /** Origin/root of the Family Tree instance, e.g. https://tree.example.com (no path). */
  baseUrl: string;
  /** Per-user API token (prefix `gtk_`) from Account menu -> API Tokens. */
  apiKey: string;
}

export function parseConfig(cfg: ConnectorConfig): FamilyTreeConfig {
  const baseUrl = String(cfg.baseUrl ?? "").replace(/\/+$/, "");
  const apiKey = String(cfg.apiKey ?? "");
  if (!baseUrl || !apiKey) {
    throw new Error("Family Tree connection is missing baseUrl or apiKey");
  }
  return { baseUrl, apiKey };
}

interface FtErrorBody {
  error: string;
}

export interface FtListMeta {
  page: number;
  per_page: number;
  total: number;
}

/**
 * Client for Geektastic Family Tree's JSON API (see docs/API.md in that repo).
 * All routes live under `/api/v1/` on the instance's root origin (baseUrl
 * should NOT include an `/api` suffix). Auth is a per-user Bearer token from
 * that user's Account menu -> API Tokens panel; it acts as that user with
 * their existing per-tree role.
 */
export class FamilyTreeClient {
  constructor(private readonly cfg: FamilyTreeConfig) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.cfg.baseUrl}/api/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
        ...(init?.headers ?? {}),
      },
    });

    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }

    if (!res.ok) {
      const message =
        body && typeof body === "object" && "error" in (body as FtErrorBody)
          ? (body as FtErrorBody).error
          : text.slice(0, 500) || res.statusText;
      throw new Error(`Family Tree API ${res.status}: ${message}`);
    }

    return body as T;
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  private post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
  }

  private put<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined });
  }

  private delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  // --- Trees ---------------------------------------------------------------

  listTrees(): Promise<{ data: unknown[] }> {
    return this.get("/trees");
  }

  getTree(treeId: number): Promise<Record<string, unknown>> {
    return this.get(`/trees/${treeId}`);
  }

  setHomePerson(treeId: number, individualId: number | null): Promise<Record<string, unknown>> {
    return this.put(`/trees/${treeId}/home-person`, { individual_id: individualId });
  }

  // --- People ----------------------------------------------------------------

  listPeople(
    treeId: number,
    params: { q?: string; surname?: string; sort?: string; dir?: string; page?: number; per_page?: number },
  ): Promise<{ data: unknown[]; meta: FtListMeta }> {
    const qs = buildQuery(params);
    return this.get(`/trees/${treeId}/people${qs}`);
  }

  createPerson(treeId: number, person: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`/trees/${treeId}/people`, person);
  }

  getPerson(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.get(`/trees/${treeId}/people/${id}`);
  }

  updatePerson(treeId: number, id: number, person: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.put(`/trees/${treeId}/people/${id}`, person);
  }

  deletePerson(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.delete(`/trees/${treeId}/people/${id}`);
  }

  addName(treeId: number, personId: number, name: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`/trees/${treeId}/people/${personId}/names`, name);
  }

  updateName(treeId: number, nameId: number, name: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.put(`/trees/${treeId}/names/${nameId}`, name);
  }

  deleteName(treeId: number, nameId: number): Promise<Record<string, unknown>> {
    return this.delete(`/trees/${treeId}/names/${nameId}`);
  }

  getPedigree(treeId: number, personId: number, generations?: number): Promise<Record<string, unknown>> {
    const qs = buildQuery({ generations });
    return this.get(`/trees/${treeId}/people/${personId}/pedigree${qs}`);
  }

  getDescendants(treeId: number, personId: number, generations?: number): Promise<Record<string, unknown>> {
    const qs = buildQuery({ generations });
    return this.get(`/trees/${treeId}/people/${personId}/descendants${qs}`);
  }

  // --- Families ----------------------------------------------------------------

  listFamilies(treeId: number): Promise<{ data: unknown[] }> {
    return this.get(`/trees/${treeId}/families`);
  }

  createFamily(treeId: number, family: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`/trees/${treeId}/families`, family);
  }

  getFamily(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.get(`/trees/${treeId}/families/${id}`);
  }

  updateFamily(treeId: number, id: number, family: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.put(`/trees/${treeId}/families/${id}`, family);
  }

  deleteFamily(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.delete(`/trees/${treeId}/families/${id}`);
  }

  addChild(treeId: number, familyId: number, child: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`/trees/${treeId}/families/${familyId}/children`, child);
  }

  updateChildRelation(
    treeId: number,
    familyId: number,
    individualId: number,
    relation: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.put(`/trees/${treeId}/families/${familyId}/children/${individualId}`, relation);
  }

  removeChild(treeId: number, familyId: number, individualId: number): Promise<Record<string, unknown>> {
    return this.delete(`/trees/${treeId}/families/${familyId}/children/${individualId}`);
  }

  // --- Events ----------------------------------------------------------------

  listEvents(treeId: number, params: { individual_id?: number; family_id?: number }): Promise<{ data: unknown[] }> {
    const qs = buildQuery(params);
    return this.get(`/trees/${treeId}/events${qs}`);
  }

  createEvent(treeId: number, event: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`/trees/${treeId}/events`, event);
  }

  getEvent(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.get(`/trees/${treeId}/events/${id}`);
  }

  updateEvent(treeId: number, id: number, event: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.put(`/trees/${treeId}/events/${id}`, event);
  }

  deleteEvent(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.delete(`/trees/${treeId}/events/${id}`);
  }

  // --- Places ----------------------------------------------------------------

  listPlaces(treeId: number, q?: string): Promise<{ data: unknown[] }> {
    const qs = buildQuery({ q });
    return this.get(`/trees/${treeId}/places${qs}`);
  }

  createPlace(treeId: number, place: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`/trees/${treeId}/places`, place);
  }

  getPlace(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.get(`/trees/${treeId}/places/${id}`);
  }

  updatePlace(treeId: number, id: number, place: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.put(`/trees/${treeId}/places/${id}`, place);
  }

  deletePlace(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.delete(`/trees/${treeId}/places/${id}`);
  }

  // --- Sources & repositories --------------------------------------------

  listSources(treeId: number): Promise<{ data: unknown[] }> {
    return this.get(`/trees/${treeId}/sources`);
  }

  createSource(treeId: number, source: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`/trees/${treeId}/sources`, source);
  }

  getSource(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.get(`/trees/${treeId}/sources/${id}`);
  }

  updateSource(treeId: number, id: number, source: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.put(`/trees/${treeId}/sources/${id}`, source);
  }

  deleteSource(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.delete(`/trees/${treeId}/sources/${id}`);
  }

  listRepositories(treeId: number): Promise<{ data: unknown[] }> {
    return this.get(`/trees/${treeId}/repositories`);
  }

  createRepository(treeId: number, repository: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`/trees/${treeId}/repositories`, repository);
  }

  getRepository(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.get(`/trees/${treeId}/repositories/${id}`);
  }

  updateRepository(treeId: number, id: number, repository: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.put(`/trees/${treeId}/repositories/${id}`, repository);
  }

  deleteRepository(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.delete(`/trees/${treeId}/repositories/${id}`);
  }

  // --- Citations ---------------------------------------------------------

  listCitations(treeId: number, q?: string): Promise<{ data: unknown[] }> {
    const qs = buildQuery({ q });
    return this.get(`/trees/${treeId}/citations${qs}`);
  }

  createCitation(treeId: number, citation: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`/trees/${treeId}/citations`, citation);
  }

  getCitation(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.get(`/trees/${treeId}/citations/${id}`);
  }

  updateCitation(treeId: number, id: number, citation: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.put(`/trees/${treeId}/citations/${id}`, citation);
  }

  deleteCitation(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.delete(`/trees/${treeId}/citations/${id}`);
  }

  detachCitation(treeId: number, id: number, owner: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`/trees/${treeId}/citations/${id}/detach`, owner);
  }

  // --- Notes ---------------------------------------------------------------

  listNotes(treeId: number, owner: Record<string, unknown>): Promise<{ data: unknown[] }> {
    const qs = buildQuery(owner);
    return this.get(`/trees/${treeId}/notes${qs}`);
  }

  createNote(treeId: number, note: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`/trees/${treeId}/notes`, note);
  }

  getNote(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.get(`/trees/${treeId}/notes/${id}`);
  }

  updateNote(treeId: number, id: number, note: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.put(`/trees/${treeId}/notes/${id}`, note);
  }

  deleteNote(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.delete(`/trees/${treeId}/notes/${id}`);
  }

  // --- Media (metadata only — uploads are multipart/form-data, out of scope) ---

  listMedia(treeId: number, owner: Record<string, unknown>): Promise<{ data: unknown[] }> {
    const qs = buildQuery(owner);
    return this.get(`/trees/${treeId}/media${qs}`);
  }

  getMedia(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.get(`/trees/${treeId}/media/${id}`);
  }

  deleteMedia(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.delete(`/trees/${treeId}/media/${id}`);
  }

  // --- Research log ------------------------------------------------------

  listResearchTasks(treeId: number, status?: string): Promise<{ data: unknown[] }> {
    const qs = buildQuery({ status });
    return this.get(`/trees/${treeId}/research-tasks${qs}`);
  }

  createResearchTask(treeId: number, task: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`/trees/${treeId}/research-tasks`, task);
  }

  getResearchTask(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.get(`/trees/${treeId}/research-tasks/${id}`);
  }

  updateResearchTask(treeId: number, id: number, task: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.put(`/trees/${treeId}/research-tasks/${id}`, task);
  }

  deleteResearchTask(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.delete(`/trees/${treeId}/research-tasks/${id}`);
  }

  // --- DNA matches -----------------------------------------------------------

  listDnaMatches(treeId: number): Promise<{ data: unknown[] }> {
    return this.get(`/trees/${treeId}/dna-matches`);
  }

  createDnaMatch(treeId: number, match: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`/trees/${treeId}/dna-matches`, match);
  }

  getDnaMatch(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.get(`/trees/${treeId}/dna-matches/${id}`);
  }

  updateDnaMatch(treeId: number, id: number, match: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.put(`/trees/${treeId}/dna-matches/${id}`, match);
  }

  deleteDnaMatch(treeId: number, id: number): Promise<Record<string, unknown>> {
    return this.delete(`/trees/${treeId}/dna-matches/${id}`);
  }

  // --- Research tools ------------------------------------------------------

  search(treeId: number, q: string): Promise<unknown[]> {
    const qs = buildQuery({ q });
    return this.get(`/trees/${treeId}/search${qs}`);
  }

  getRelationship(treeId: number, from: number, to: number): Promise<Record<string, unknown>> {
    const qs = buildQuery({ from, to });
    return this.get(`/trees/${treeId}/relationship${qs}`);
  }

  getGapsReport(treeId: number): Promise<Record<string, unknown>> {
    return this.get(`/trees/${treeId}/reports/gaps`);
  }

  getDuplicatesReport(treeId: number): Promise<{ data: unknown[] }> {
    return this.get(`/trees/${treeId}/reports/duplicates`);
  }
}

function buildQuery(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}
