import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Connections } from "./pages/Connections";
import { Tools } from "./pages/Tools";
import { Tokens } from "./pages/Tokens";
import { Playground } from "./pages/Playground";
import { Logs } from "./pages/Logs";
import { Users } from "./pages/Users";
import { Profile } from "./pages/Profile";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
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
          path="tokens"
          element={
            <RequireAdmin>
              <Tokens />
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
