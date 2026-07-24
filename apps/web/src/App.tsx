import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Connections } from "./pages/Connections";
import { Tools } from "./pages/Tools";
import { Prompts } from "./pages/Prompts";
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
          path="tools"
          element={
            <RequireAdmin>
              <Tools />
            </RequireAdmin>
          }
        />
        <Route
          path="prompts"
          element={
            <RequireAdmin>
              <Prompts />
            </RequireAdmin>
          }
        />
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
