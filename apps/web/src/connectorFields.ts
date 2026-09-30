/**
 * Form hints for connectors whose config is just `{ baseUrl, apiKey }`.
 * Any other connector falls back to a raw JSON config field.
 */
export const BASE_URL_APIKEY_CONNECTORS: Record<
  string,
  { baseUrlPlaceholder: string; baseUrlHint: string; apiKeyPlaceholder: string }
> = {
  "geektastic-realms": {
    baseUrlPlaceholder: "https://realms.example.com",
    baseUrlHint: "Root URL of your Geektastic Realms instance — no `/api` suffix, that's added automatically.",
    apiKeyPlaceholder: "grapi_...",
  },
  "family-tree": {
    baseUrlPlaceholder: "https://tree.example.com",
    baseUrlHint: "Root URL of your Geektastic Family Tree instance — no `/api` suffix, that's added automatically.",
    apiKeyPlaceholder: "gtk_...",
  },
};

export const inputClass = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white";
export const primaryButton =
  "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50";
export const secondaryButton =
  "rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50";
