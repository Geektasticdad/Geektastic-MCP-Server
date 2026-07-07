import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function Profile() {
  const { user, refresh } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.post("/api/auth/change-password", { currentPassword, newPassword }),
    onSuccess: async () => {
      setMessage({ type: "success", text: "Password updated." });
      setCurrentPassword("");
      setNewPassword("");
      await refresh();
    },
    onError: (err) =>
      setMessage({ type: "error", text: err instanceof ApiError ? err.message : "Failed to update password" }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    mutation.mutate();
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-white">Profile</h1>
      <div className="rounded-md border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
        <div>
          <span className="text-slate-500">Username:</span> {user?.username}
        </div>
        <div>
          <span className="text-slate-500">Email:</span> {user?.email}
        </div>
        <div>
          <span className="text-slate-500">Role:</span> {user?.role}
        </div>
      </div>

      {user?.mustChangePassword && (
        <div className="rounded-md bg-amber-950 px-3 py-2 text-sm text-amber-300">
          Your password was set by an admin. Please choose a new one.
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-lg font-medium text-white">Change password</h2>
        {message && (
          <div
            className={`rounded-md px-3 py-2 text-sm ${
              message.type === "success" ? "bg-emerald-950 text-emerald-300" : "bg-red-950 text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm text-slate-300">Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Update password
        </button>
      </form>
    </div>
  );
}
