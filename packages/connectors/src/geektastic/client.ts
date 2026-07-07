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
}
