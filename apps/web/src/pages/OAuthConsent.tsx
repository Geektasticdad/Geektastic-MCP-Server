import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

interface DecisionResponse {
  redirectTo: string;
}

export function OAuthConsent() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const clientName = searchParams.get("clientName") ?? "This application";
  const redirectUri = searchParams.get("redirect_uri") ?? "";

  const decisionBody = {
    client_id: searchParams.get("client_id") ?? "",
    redirect_uri: redirectUri,
    code_challenge: searchParams.get("code_challenge") ?? "",
    code_challenge_method: "S256" as const,
    state: searchParams.get("state") ?? undefined,
    resource: searchParams.get("resource") ?? undefined,
    scope: searchParams.get("scope") ?? undefined,
  };

  async function decide(approve: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<DecisionResponse>("/oauth/authorize/decision", { ...decisionBody, approve });
      window.location.href = result.redirectTo;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to complete authorization");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h1 className="mb-2 text-xl font-semibold text-white">Authorize access</h1>
        <p className="mb-6 text-sm text-slate-300">
          <span className="font-medium text-white">{clientName}</span> wants to access your Geektastic MCP Server
          tools on your behalf.
        </p>
        {redirectUri && (
          <p className="mb-4 truncate text-xs text-slate-500">
            You'll be redirected to <span className="text-slate-400">{redirectUri}</span>
          </p>
        )}
        {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</div>}
        <div className="flex gap-3">
          <button
            onClick={() => void decide(true)}
            disabled={submitting}
            className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => void decide(false)}
            disabled={submitting}
            className="flex-1 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
