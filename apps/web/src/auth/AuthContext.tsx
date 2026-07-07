import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicUser } from "@geektastic/shared";
import { api, ApiError, setCsrfToken } from "../api/client";

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const data = await api.get<{ user: PublicUser }>("/api/auth/me");
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else {
        throw err;
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(username: string, password: string) {
    const data = await api.post<{ user: PublicUser; csrfToken: string }>("/api/auth/login", { username, password });
    // Login regenerates the session (invalidating whatever CSRF token was cached
    // before it), so the fresh one comes back directly in this response instead
    // of requiring a follow-up /api/auth/csrf round trip.
    setCsrfToken(data.csrfToken);
    setUser(data.user);
  }

  async function logout() {
    await api.post("/api/auth/logout");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
