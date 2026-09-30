import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { AppConnectionSummary } from "@geektastic/shared";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

const navItem =
  "block rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-800 hover:text-white";
const navItemActive = "bg-slate-800 text-white";
const navItemInactive = "text-slate-300";
const subNavItem = "block truncate rounded-md py-1.5 pl-6 pr-3 text-sm transition-colors hover:bg-slate-800 hover:text-white";
const groupHeading = "pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500";

const linkClass = ({ isActive }: { isActive: boolean }) => `${navItem} ${isActive ? navItemActive : navItemInactive}`;
const subLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${subNavItem} ${isActive ? "text-white" : "text-slate-400"}`;

export function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the phone menu after navigating.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const { data: connections } = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<{ connections: AppConnectionSummary[] }>("/api/connections"),
    enabled: isAdmin,
    refetchInterval: 60000,
  });

  return (
    <div className="min-h-screen md:flex">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3 md:hidden">
        <span className="font-semibold text-white">Geektastic MCP</span>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          className="rounded-md px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </header>

      <aside
        id="sidebar"
        className={`${menuOpen ? "block" : "hidden"} shrink-0 border-r border-slate-800 bg-slate-900 p-4 md:block md:w-60`}
      >
        <div className="mb-6 hidden text-lg font-semibold text-white md:block">Geektastic MCP</div>
        <nav className="space-y-1">
          <NavLink to="/" end className={linkClass}>
            Overview
          </NavLink>
          <NavLink to="/logs" className={linkClass}>
            Activity
          </NavLink>
          <NavLink to="/playground" className={linkClass}>
            Testing Playground
          </NavLink>

          {isAdmin && (
            <>
              <div className={groupHeading}>Configure</div>
              <NavLink to="/connections" end className={linkClass}>
                Connections
              </NavLink>
              {connections?.connections.map((conn) => (
                <NavLink key={conn.id} to={`/connections/${conn.id}`} className={subLinkClass} title={conn.name}>
                  <span
                    aria-hidden
                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                      !conn.enabled ? "bg-slate-600" : conn.health?.ok ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  {conn.name}
                </NavLink>
              ))}

              <div className={groupHeading}>Access</div>
              <NavLink to="/tokens" className={linkClass}>
                Tokens
              </NavLink>
              <NavLink to="/oauth-clients" className={linkClass}>
                OAuth Clients
              </NavLink>
              <NavLink to="/users" className={linkClass}>
                Users
              </NavLink>
            </>
          )}

          <div className={groupHeading}>Account</div>
          <NavLink to="/profile" className={linkClass}>
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
      <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
        <Outlet />
      </main>
    </div>
  );
}
