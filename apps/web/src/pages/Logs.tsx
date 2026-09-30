import { ActivityLog } from "../components/ActivityLog";

export function Logs() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Activity</h1>
      <p className="max-w-2xl text-sm text-slate-400">
        Every tool and prompt call, from MCP clients and the Testing Playground, across all connections.
      </p>
      <ActivityLog />
    </div>
  );
}
