import type { ConnectorConfig } from "../types.js";

export interface GeektasticConfig {
  /** Origin/root of the Geektastic Realms instance, e.g. https://realms.example.com (no path). */
  baseUrl: string;
  /** Per-world "General API Access" bearer token (prefix `grapi_`). */
  apiKey: string;
}

export function parseConfig(cfg: ConnectorConfig): GeektasticConfig {
  const baseUrl = String(cfg.baseUrl ?? "").replace(/\/+$/, "");
  const apiKey = String(cfg.apiKey ?? "");
  if (!baseUrl || !apiKey) {
    throw new Error("Geektastic Realms connection is missing baseUrl or apiKey");
  }
  return { baseUrl, apiKey };
}

interface GrErrorBody {
  ok: false;
  error: string;
}

export interface GrPingResponse {
  ok: true;
  setting: { id: number; name: string };
  server_time: string;
  gr_version: string;
}

export interface GrStatblockSummary {
  entry_id: number;
  name: string;
  category: string;
  challenge_rating: string;
}

export interface GrStatblockDetail {
  ok: true;
  entry_id: number;
  category_id: number;
  statblock: Record<string, unknown>;
}

export interface GrCampaignSummary {
  id: number;
  title: string;
  slug: string;
  summary: string;
  description: string;
  status: string;
}

export interface GrEntrySummary {
  entry_id: number;
  title: string;
  category_id: number;
}

export interface GrEntryDetail {
  ok: true;
  entry_id: number;
  category_id: number;
  /** gr-entry-v1 — custom_fields shape is category-specific, not knowable ahead of time. */
  entry: Record<string, unknown>;
}

export interface GrModuleSummary {
  module_id: number;
  title: string;
  slug: string;
  summary: string;
  status: string;
  campaign_id: number | null;
}

export interface GrModuleDetail {
  ok: true;
  module_id: number;
  /**
   * gr-module-v1 — nested Act/Chapter/Scene tree, see Docs/API.md. Deliberately
   * lightweight (no body_html, name-only encounter/handout stubs) since a real
   * module's full text can be hundreds of KB. Use getSection() for one
   * section's full content.
   */
  module: Record<string, unknown>;
}

export interface GrSection {
  id: number;
  type: string;
  title: string;
  body_html: string;
  parent_id: number | null;
  sort_order: number;
}

export interface GrSectionDetail {
  ok: true;
  module_id: number;
  section_id: number;
  section: GrSection;
}

export interface GrSectionSearchResult {
  section_id: number;
  module_id: number;
  module_title: string;
  type: string;
  title: string;
}

export interface GrSectionStub {
  id: number;
  type: string;
  title: string;
  sort_order: number;
}

export interface GrSectionFull extends GrSection {
  encounters: GrEncounter[];
  handouts: GrHandout[];
  /** One level only — no grandchildren, no body text. Call getSection() again to drill further. */
  children: GrSectionStub[];
}

export interface GrSectionFullDetail {
  ok: true;
  module_id: number;
  section_id: number;
  section: GrSectionFull;
}

export interface GrHandout {
  id: number;
  title: string;
  body_html: string;
  media_id: number | null;
  section_id: number | null;
}

export interface GrHandoutDetail {
  ok: true;
  module_id: number;
  handout_id: number;
  handout: GrHandout;
}

export interface GrEncounterAdversary {
  entry_id: number;
  name: string;
  category: string;
  quantity: number;
}

export interface GrEncounter {
  id: number;
  name: string;
  encounter_type: string;
  difficulty: string;
  setup: string;
  tactics: string;
  rewards: string;
  notes: string;
  adversaries: GrEncounterAdversary[];
}

export interface GrEncounterDetail {
  ok: true;
  module_id: number;
  section_id: number;
  encounter_id: number;
  encounter: GrEncounter;
}

export interface GrOkResponse {
  ok: true;
}

export interface GrRollTableRow {
  range_start: number;
  range_end: number;
  title: string;
  type: string[];
  description: string;
  dm_note: string;
}

/** Lightweight — no rows. See GrRollTable for full detail. */
export interface GrRollTableSummary {
  id: number;
  title: string;
  section_id: number | null;
  die: string;
  row_count: number;
}

export interface GrRollTable {
  id: number;
  title: string;
  dm_notes: string;
  section_id: number | null;
  /** Computed from the stored rows, never stored — the smallest standard die covering the highest range_end. */
  die: string;
  rows: GrRollTableRow[];
}

export interface GrRollTableDetail {
  ok: true;
  module_id: number;
  roll_table_id: number;
  roll_table: GrRollTable;
}

/** Lightweight — no summary/notes body text. See GrSession for full detail. */
export interface GrSessionSummary {
  id: number;
  title: string;
  played_on: string | null;
  xp_awarded: number | null;
  gp_gained: number | null;
}

export interface GrSession {
  id: number;
  title: string;
  played_on: string | null;
  summary: string;
  notes: string;
  next_session_prep: string;
  player_recap: string;
  xp_awarded: number | null;
  gp_gained: number | null;
  loot_notes: string;
  sections_covered: number[];
}

export interface GrSessionDetail {
  ok: true;
  module_id: number;
  session_id: number;
  session: GrSession;
}

export interface GrEra {
  id: number;
  name: string;
  era_label: string | null;
  age_id: number | null;
  start_year: number | null;
  end_year: number | null;
  color: string;
  description: string;
  dm_notes: string;
}

export interface GrEraDetail {
  ok: true;
  era_id: number;
  era: GrEra;
}

export interface GrHistoryEvent {
  id: number;
  title: string;
  era_id: number | null;
  age_id: number | null;
  year_in_epoch: number | null;
  month_number: number | null;
  day: number | null;
  body_html: string;
  dm_notes: string;
  is_secret: boolean;
}

export interface GrHistoryEventDetail {
  ok: true;
  event_id: number;
  event: GrHistoryEvent;
}

/**
 * Client for Geektastic Realms' "General-Purpose API" — see
 * geektastic-realms/Docs/API.md. All routes live under `/api/v1/` on the
 * instance's root origin (baseUrl should NOT include an `/api` suffix).
 * Auth is a per-world Bearer token from that world's "General API Access" panel.
 */
export class GeektasticRealmsClient {
  constructor(private readonly cfg: GeektasticConfig) {}

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
        body && typeof body === "object" && "error" in (body as GrErrorBody)
          ? (body as GrErrorBody).error
          : text.slice(0, 500) || res.statusText;
      throw new Error(`Geektastic Realms API ${res.status}: ${message}`);
    }

    return body as T;
  }

  ping(): Promise<GrPingResponse> {
    return this.request("/ping");
  }

  searchStatblocks(query?: string): Promise<{ ok: true; statblocks: GrStatblockSummary[] }> {
    const qs = query ? `?q=${encodeURIComponent(query)}` : "";
    return this.request(`/statblocks${qs}`);
  }

  getStatblock(entryId: number): Promise<GrStatblockDetail> {
    return this.request(`/statblocks/${entryId}`);
  }

  createStatblock(categoryId: number, statblock: Record<string, unknown>): Promise<GrStatblockDetail> {
    return this.request("/statblocks", {
      method: "POST",
      body: JSON.stringify({ category_id: categoryId, statblock }),
    });
  }

  updateStatblock(entryId: number, statblock: Record<string, unknown>): Promise<GrStatblockDetail> {
    return this.request(`/statblocks/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify({ statblock }),
    });
  }

  listCampaigns(): Promise<{ ok: true; campaigns: GrCampaignSummary[] }> {
    return this.request("/campaigns");
  }

  getCampaign(id: number): Promise<{ ok: true; campaign: GrCampaignSummary }> {
    return this.request(`/campaigns/${id}`);
  }

  searchEntries(categoryId?: number, query?: string): Promise<{ ok: true; entries: GrEntrySummary[] }> {
    const params = new URLSearchParams();
    if (categoryId !== undefined) params.set("category_id", String(categoryId));
    if (query) params.set("q", query);
    const qs = params.toString();
    return this.request(`/entries${qs ? `?${qs}` : ""}`);
  }

  getEntry(entryId: number): Promise<GrEntryDetail> {
    return this.request(`/entries/${entryId}`);
  }

  createEntry(categoryId: number, entry: Record<string, unknown>): Promise<GrEntryDetail> {
    return this.request("/entries", {
      method: "POST",
      body: JSON.stringify({ category_id: categoryId, entry }),
    });
  }

  updateEntry(entryId: number, entry: Record<string, unknown>): Promise<GrEntryDetail> {
    return this.request(`/entries/${entryId}`, { method: "PATCH", body: JSON.stringify({ entry }) });
  }

  listModules(): Promise<{ ok: true; modules: GrModuleSummary[] }> {
    return this.request("/modules");
  }

  getModule(moduleId: number): Promise<GrModuleDetail> {
    return this.request(`/modules/${moduleId}`);
  }

  createModule(module: Record<string, unknown>): Promise<GrModuleDetail> {
    return this.request("/modules", { method: "POST", body: JSON.stringify({ module }) });
  }

  updateModule(moduleId: number, module: Record<string, unknown>): Promise<GrModuleDetail> {
    return this.request(`/modules/${moduleId}`, { method: "PATCH", body: JSON.stringify({ module }) });
  }

  searchSections(query?: string, type?: string): Promise<{ ok: true; sections: GrSectionSearchResult[] }> {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (type) params.set("type", type);
    const qs = params.toString();
    return this.request(`/sections${qs ? `?${qs}` : ""}`);
  }

  getSection(moduleId: number, sectionId: number): Promise<GrSectionFullDetail> {
    return this.request(`/modules/${moduleId}/sections/${sectionId}`);
  }

  createSection(moduleId: number, section: Record<string, unknown>): Promise<GrSectionDetail> {
    return this.request(`/modules/${moduleId}/sections`, {
      method: "POST",
      body: JSON.stringify({ section }),
    });
  }

  updateSection(moduleId: number, sectionId: number, section: Record<string, unknown>): Promise<GrSectionDetail> {
    return this.request(`/modules/${moduleId}/sections/${sectionId}`, {
      method: "PATCH",
      body: JSON.stringify({ section }),
    });
  }

  createHandout(moduleId: number, handout: Record<string, unknown>): Promise<GrHandoutDetail> {
    return this.request(`/modules/${moduleId}/handouts`, {
      method: "POST",
      body: JSON.stringify({ handout }),
    });
  }

  updateHandout(moduleId: number, handoutId: number, handout: Record<string, unknown>): Promise<GrHandoutDetail> {
    return this.request(`/modules/${moduleId}/handouts/${handoutId}`, {
      method: "PATCH",
      body: JSON.stringify({ handout }),
    });
  }

  createEncounter(moduleId: number, sectionId: number, encounter: Record<string, unknown>): Promise<GrEncounterDetail> {
    return this.request(`/modules/${moduleId}/sections/${sectionId}/encounters`, {
      method: "POST",
      body: JSON.stringify({ encounter }),
    });
  }

  updateEncounter(moduleId: number, encounterId: number, encounter: Record<string, unknown>): Promise<GrEncounterDetail> {
    return this.request(`/modules/${moduleId}/encounters/${encounterId}`, {
      method: "PATCH",
      body: JSON.stringify({ encounter }),
    });
  }

  getEncounter(moduleId: number, encounterId: number): Promise<GrEncounterDetail> {
    return this.request(`/modules/${moduleId}/encounters/${encounterId}`);
  }

  getHandout(moduleId: number, handoutId: number): Promise<GrHandoutDetail> {
    return this.request(`/modules/${moduleId}/handouts/${handoutId}`);
  }

  createCampaign(campaign: Record<string, unknown>): Promise<{ ok: true; campaign_id: number; campaign: GrCampaignSummary }> {
    return this.request("/campaigns", { method: "POST", body: JSON.stringify({ campaign }) });
  }

  updateCampaign(
    id: number,
    campaign: Record<string, unknown>
  ): Promise<{ ok: true; campaign_id: number; campaign: GrCampaignSummary }> {
    return this.request(`/campaigns/${id}`, { method: "PATCH", body: JSON.stringify({ campaign }) });
  }

  listRollTables(moduleId: number): Promise<{ ok: true; module_id: number; roll_tables: GrRollTableSummary[] }> {
    return this.request(`/modules/${moduleId}/roll-tables`);
  }

  getRollTable(moduleId: number, rollTableId: number): Promise<GrRollTableDetail> {
    return this.request(`/modules/${moduleId}/roll-tables/${rollTableId}`);
  }

  createRollTable(moduleId: number, rollTable: Record<string, unknown>): Promise<GrRollTableDetail> {
    return this.request(`/modules/${moduleId}/roll-tables`, {
      method: "POST",
      body: JSON.stringify({ roll_table: rollTable }),
    });
  }

  updateRollTable(moduleId: number, rollTableId: number, rollTable: Record<string, unknown>): Promise<GrRollTableDetail> {
    return this.request(`/modules/${moduleId}/roll-tables/${rollTableId}`, {
      method: "PATCH",
      body: JSON.stringify({ roll_table: rollTable }),
    });
  }

  listSessions(moduleId: number): Promise<{ ok: true; module_id: number; sessions: GrSessionSummary[] }> {
    return this.request(`/modules/${moduleId}/sessions`);
  }

  getSession(moduleId: number, sessionId: number): Promise<GrSessionDetail> {
    return this.request(`/modules/${moduleId}/sessions/${sessionId}`);
  }

  createSession(moduleId: number, session: Record<string, unknown>): Promise<GrSessionDetail> {
    return this.request(`/modules/${moduleId}/sessions`, {
      method: "POST",
      body: JSON.stringify({ session }),
    });
  }

  updateSession(moduleId: number, sessionId: number, session: Record<string, unknown>): Promise<GrSessionDetail> {
    return this.request(`/modules/${moduleId}/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify({ session }),
    });
  }

  listEras(): Promise<{ ok: true; eras: GrEra[] }> {
    return this.request("/history/eras");
  }

  getEra(eraId: number): Promise<GrEraDetail> {
    return this.request(`/history/eras/${eraId}`);
  }

  createEra(era: Record<string, unknown>): Promise<GrEraDetail> {
    return this.request("/history/eras", { method: "POST", body: JSON.stringify({ era }) });
  }

  updateEra(eraId: number, era: Record<string, unknown>): Promise<GrEraDetail> {
    return this.request(`/history/eras/${eraId}`, { method: "PATCH", body: JSON.stringify({ era }) });
  }

  listEvents(): Promise<{ ok: true; events: GrHistoryEvent[] }> {
    return this.request("/history/events");
  }

  getEvent(eventId: number): Promise<GrHistoryEventDetail> {
    return this.request(`/history/events/${eventId}`);
  }

  createEvent(event: Record<string, unknown>): Promise<GrHistoryEventDetail> {
    return this.request("/history/events", { method: "POST", body: JSON.stringify({ event }) });
  }

  updateEvent(eventId: number, event: Record<string, unknown>): Promise<GrHistoryEventDetail> {
    return this.request(`/history/events/${eventId}`, { method: "PATCH", body: JSON.stringify({ event }) });
  }

  deleteEntry(entryId: number): Promise<GrOkResponse> {
    return this.request(`/entries/${entryId}`, { method: "DELETE" });
  }

  deleteSection(moduleId: number, sectionId: number): Promise<GrOkResponse> {
    return this.request(`/modules/${moduleId}/sections/${sectionId}`, { method: "DELETE" });
  }

  deleteEncounter(moduleId: number, encounterId: number): Promise<GrOkResponse> {
    return this.request(`/modules/${moduleId}/encounters/${encounterId}`, { method: "DELETE" });
  }

  deleteHandout(moduleId: number, handoutId: number): Promise<GrOkResponse> {
    return this.request(`/modules/${moduleId}/handouts/${handoutId}`, { method: "DELETE" });
  }
}
