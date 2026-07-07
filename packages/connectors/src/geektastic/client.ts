import type { ConnectorConfig } from "../types.js";

export interface GeektasticConfig {
  baseUrl: string;
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

export class GeektasticRealmsClient {
  constructor(private readonly cfg: GeektasticConfig) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Geektastic Realms API ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  ping(): Promise<unknown> {
    return this.request("/ping");
  }

  searchStatblocks(query: string): Promise<unknown> {
    return this.request(`/statblocks?q=${encodeURIComponent(query)}`);
  }

  getStatblock(entryId: string): Promise<unknown> {
    return this.request(`/statblocks/${encodeURIComponent(entryId)}`);
  }

  createStatblock(categoryId: number, statblock: unknown): Promise<unknown> {
    return this.request("/statblocks", {
      method: "POST",
      body: JSON.stringify({ category_id: categoryId, statblock }),
    });
  }

  updateStatblock(entryId: string, statblock: unknown): Promise<unknown> {
    return this.request(`/statblocks/${encodeURIComponent(entryId)}`, {
      method: "PATCH",
      body: JSON.stringify({ statblock }),
    });
  }

  listCampaigns(): Promise<unknown> {
    return this.request("/campaigns");
  }

  getCampaign(id: string): Promise<unknown> {
    return this.request(`/campaigns/${encodeURIComponent(id)}`);
  }
}
