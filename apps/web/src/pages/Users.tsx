import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { PublicUser, UserRole } from "@geektastic/shared";

export function Users() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ users: PublicUser[] }>("/api/users"),
  });

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: { username: string; email: string; password: string; role: UserRole }) =>
      api.post("/api/users", body),
    onSuccess: () => {
      setUsername("");
      setEmail("");
      setPassword("");
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : "Failed to create user"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: UserRole; status?: "active" | "disabled" }) =>
      api.patch(`/api/users/${id}`, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      api.post(`/api/users/${id}/reset-password`, { newPassword }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate({ username, email, password, role });
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">Users</h1>

      <form onSubmit={onSubmit} className="max-w-lg space-y-3 rounded-md border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-lg font-medium text-white">Add user</h2>
        {formError && <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{formError}</div>}
        <div>
          <label className="mb-1 block text-sm text-slate-300">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">Initial password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <p className="text-xs text-slate-500">The user will be required to change this password on first login.</p>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Create user
        </button>
      </form>

      <div className="overflow-hidden rounded-md border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-2">Username</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Last login</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id} className="border-t border-slate-800">
                <td className="px-4 py-2 text-slate-200">{u.username}</td>
                <td className="px-4 py-2 text-slate-400">{u.email}</td>
                <td className="px-4 py-2">
                  <select
                    value={u.role}
                    disabled={u.id === currentUser?.id}
                    onChange={(e) => updateMutation.mutate({ id: u.id, role: e.target.value as UserRole })}
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white disabled:opacity-50"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <button
                    disabled={u.id === currentUser?.id}
                    onClick={() =>
                      updateMutation.mutate({ id: u.id, status: u.status === "active" ? "disabled" : "active" })
                    }
                    className={`rounded-md px-3 py-1 text-xs disabled:opacity-50 ${
                      u.status === "active" ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-red-950 text-red-300"
                    }`}
                  >
                    {u.status === "active" ? "Active" : "Disabled"}
                  </button>
                </td>
                <td className="px-4 py-2 text-slate-400">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => {
                      const newPassword = prompt(`New password for ${u.username} (min 8 chars):`);
                      if (newPassword) resetMutation.mutate({ id: u.id, newPassword });
                    }}
                    className="rounded-md bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
                  >
                    Reset password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
