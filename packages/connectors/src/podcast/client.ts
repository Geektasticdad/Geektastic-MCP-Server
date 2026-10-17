import type { ConnectorConfig } from "../types.js";

export interface PodcastConfig {
  /** Origin of the Podcast Management app, e.g. https://podcast.example.com (no path). */
  baseUrl: string;
  /** API token from Admin -> Settings -> API Access (prefix `pma_`). */
  apiKey: string;
}

export function parseConfig(cfg: ConnectorConfig): PodcastConfig {
  const baseUrl = String(cfg.baseUrl ?? "").replace(/\/+$/, "");
  const apiKey = String(cfg.apiKey ?? "");
  if (!baseUrl || !apiKey) {
    throw new Error("Podcast Management connection is missing baseUrl or apiKey");
  }
  return { baseUrl, apiKey };
}

export interface PmListMeta {
  page: number;
  per_page: number;
  total: number;
}

export type PmList = { data: unknown[]; meta?: PmListMeta };
export type PmRecord = Record<string, unknown>;

/**
 * Client for the Podcast Management app's JSON API (see API.md in the
 * podcast-management-app repo). All routes live under `/api/v1/` on the
 * app's root origin. Auth is a Bearer token created by an admin under
 * Admin -> Settings -> API Access; it acts as the user it was issued for,
 * and write calls need a read+write token whose user is an admin or editor.
 * The API has no delete endpoints for episodes, series, guests, or recordings.
 */
export class PodcastClient {
  constructor(private readonly cfg: PodcastConfig) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.cfg.baseUrl}/api/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
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
      const err = body && typeof body === "object" ? (body as { error?: string; fields?: unknown }) : undefined;
      const fields = err?.fields ? ` ${JSON.stringify(err.fields)}` : "";
      const message = err?.error ? `${err.error}${fields}` : text.slice(0, 500) || res.statusText;
      throw new Error(`Podcast Management API ${res.status}: ${message}`);
    }
    if (body === undefined) {
      throw new Error(`Podcast Management API returned a non-JSON response (${res.status}). Check the base URL.`);
    }
    return body as T;
  }

  private get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>(`${path}${buildQuery(params ?? {})}`);
  }

  private post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>(path, { method: "POST", body: JSON.stringify(body) });
  }

  private patch<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
  }

  // --- Account & lookups -----------------------------------------------------

  me(): Promise<PmRecord> {
    return this.get("/me");
  }

  lookups(): Promise<PmRecord> {
    return this.get("/lookups");
  }

  // --- Producer: pipeline and stage-automation suggestions ---------------------

  pipeline(): Promise<PmRecord> {
    return this.get("/pipeline");
  }

  listStatusSuggestions(params: Record<string, unknown>): Promise<PmList> {
    return this.get("/status-suggestions", params);
  }

  resolveStatusSuggestion(id: number, action: "apply" | "dismiss"): Promise<PmRecord> {
    return this.post(`/status-suggestions/${id}/${action}`, {});
  }

  // --- Episodes -----------------------------------------------------------------

  listEpisodes(params: Record<string, unknown>): Promise<PmList> {
    return this.get("/episodes", params);
  }

  getEpisode(id: number): Promise<PmRecord> {
    return this.get(`/episodes/${id}`);
  }

  createEpisode(episode: Record<string, unknown>): Promise<PmRecord> {
    return this.post("/episodes", episode);
  }

  updateEpisode(id: number, changes: Record<string, unknown>): Promise<PmRecord> {
    return this.patch(`/episodes/${id}`, changes);
  }

  // --- Series -------------------------------------------------------------------

  listSeries(params: Record<string, unknown>): Promise<PmList> {
    return this.get("/series", params);
  }

  getSeries(id: number): Promise<PmRecord> {
    return this.get(`/series/${id}`);
  }

  createSeries(series: Record<string, unknown>): Promise<PmRecord> {
    return this.post("/series", series);
  }

  updateSeries(id: number, changes: Record<string, unknown>): Promise<PmRecord> {
    return this.patch(`/series/${id}`, changes);
  }

  getSeriesContextLog(id: number): Promise<PmRecord> {
    return this.get(`/series/${id}/context-log`);
  }

  // --- Guests -------------------------------------------------------------------

  listGuests(params: Record<string, unknown>): Promise<PmList> {
    return this.get("/guests", params);
  }

  getGuest(id: number): Promise<PmRecord> {
    return this.get(`/guests/${id}`);
  }

  createGuest(guest: Record<string, unknown>): Promise<PmRecord> {
    return this.post("/guests", guest);
  }

  updateGuest(id: number, changes: Record<string, unknown>): Promise<PmRecord> {
    return this.patch(`/guests/${id}`, changes);
  }

  // --- Recordings ---------------------------------------------------------------

  listRecordings(params: Record<string, unknown>): Promise<PmList> {
    return this.get("/recordings", params);
  }

  getRecording(id: number): Promise<PmRecord> {
    return this.get(`/recordings/${id}`);
  }

  createRecording(recording: Record<string, unknown>): Promise<PmRecord> {
    return this.post("/recordings", recording);
  }

  updateRecording(id: number, changes: Record<string, unknown>): Promise<PmRecord> {
    return this.patch(`/recordings/${id}`, changes);
  }

  // --- Notes --------------------------------------------------------------------

  listNotes(entityType: string, entityId: number): Promise<PmList> {
    return this.get("/notes", { entity_type: entityType, entity_id: entityId });
  }

  createNote(note: Record<string, unknown>): Promise<PmRecord> {
    return this.post("/notes", note);
  }

  // --- Production documents -----------------------------------------------------

  listDocuments(params: Record<string, unknown>): Promise<PmList> {
    return this.get("/documents", params);
  }

  getDocument(id: number): Promise<PmRecord> {
    return this.get(`/documents/${id}`);
  }

  saveDocument(doc: Record<string, unknown>): Promise<PmRecord> {
    return this.post("/documents", doc);
  }

  // --- Guest intake submissions (read-only) -------------------------------------

  listIntakeSubmissions(params: Record<string, unknown>): Promise<PmList> {
    return this.get("/intake-submissions", params);
  }

  getIntakeSubmission(id: number): Promise<PmRecord> {
    return this.get(`/intake-submissions/${id}`);
  }
}

function buildQuery(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    usp.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}
