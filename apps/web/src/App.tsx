import { Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Connections } from "./pages/Connections";
import { ConnectionDetail } from "./pages/ConnectionDetail";
import { Tokens } from "./pages/Tokens";
import { OAuthClients } from "./pages/OAuthClients";
import { OAuthConsent } from "./pages/OAuthConsent";
import { Playground } from "./pages/Playground";
import { Logs } from "./pages/Logs";
import { Users } from "./pages/Users";
import { Profile } from "./pages/Profile";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading...</div>;
  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }
  return <>{children}</>;
}

/**
 * The old global Tools/Prompts pages (before 1.6.3) now live under each
 * connection. `/tools?tool=<connectionId>:<toolName>` links from 1.6.2 go
 * straight to that tool's panel.
 */
function LegacyToolsRedirect() {
  const [params] = useSearchParams();
  const key = params.get("tool");
  const split = key?.indexOf(":") ?? -1;
  if (key && split > 0) {
    const connectionId = key.slice(0, split);
    const toolName = key.slice(split + 1);
    return <Navigate to={`/connections/${connectionId}/tools?tool=${encodeURIComponent(toolName)}`} replace />;
  }
  return <Navigate to="/connections" replace />;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/oauth/consent"
        element={
          <RequireAuth>
            <OAuthConsent />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="playground" element={<Playground />} />
        <Route path="logs" element={<Logs />} />
        <Route path="profile" element={<Profile />} />
        <Route
          path="connections"
          element={
            <RequireAdmin>
              <Connections />
            </RequireAdmin>
          }
        />
        <Route
          path="connections/:id/:tab?"
          element={
            <RequireAdmin>
              <ConnectionDetail />
            </RequireAdmin>
          }
        />
        <Route path="tools" element={<LegacyToolsRedirect />} />
        <Route path="prompts" element={<Navigate to="/connections" replace />} />
        <Route
          path="tokens"
          element={
            <RequireAdmin>
              <Tokens />
            </RequireAdmin>
          }
        />
        <Route
          path="oauth-clients"
          element={
            <RequireAdmin>
              <OAuthClients />
            </RequireAdmin>
          }
        />
        <Route
          path="users"
          element={
            <RequireAdmin>
              <Users />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
