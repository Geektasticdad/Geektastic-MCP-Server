import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const navItem =
  "block rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-800 hover:text-white";
const navItemActive = "bg-slate-800 text-white";
const navItemInactive = "text-slate-300";

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-900 p-4">
        <div className="mb-6 text-lg font-semibold text-white">Geektastic MCP</div>
        <nav className="space-y-1">
          <NavLink to="/" end className={({ isActive }) => `${navItem} ${isActive ? navItemActive : navItemInactive}`}>
            Dashboard
          </NavLink>
          <NavLink to="/playground" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : navItemInactive}`}>
            Testing Playground
          </NavLink>
          <NavLink to="/logs" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : navItemInactive}`}>
            Logs
          </NavLink>
          {user?.role === "admin" && (
            <>
              <div className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Admin</div>
              <NavLink to="/connections" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : navItemInactive}`}>
                Connections
              </NavLink>
              <NavLink to="/tools" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : navItemInactive}`}>
                Tools
              </NavLink>
              <NavLink to="/tokens" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : navItemInactive}`}>
                Tokens
              </NavLink>
              <NavLink to="/users" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : navItemInactive}`}>
                Users
              </NavLink>
            </>
          )}
          <div className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Account</div>
          <NavLink to="/profile" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : navItemInactive}`}>
            Profile
          </NavLink>
        </nav>
        <div className="mt-8 border-t border-slate-800 pt-4 text-sm text-slate-400">
          <div className="mb-2 truncate">
            {user?.username} <span className="text-slate-600">({user?.role})</span>
          </div>
          <button
            onClick={() => void logout()}
            className="w-full rounded-md bg-slate-800 px-3 py-1.5 text-left text-slate-200 hover:bg-slate-700"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
