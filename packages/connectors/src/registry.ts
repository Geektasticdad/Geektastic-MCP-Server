import type { AppConnector, ConnectorConfig, ToolDefinition } from "./types.js";
import { geektasticRealmsConnector } from "./geektastic/index.js";

/**
 * All connectors known to this build. Add a new app here after implementing
 * `AppConnector` under packages/connectors/src/<app>/.
 */
const CONNECTORS: AppConnector[] = [geektasticRealmsConnector];

const connectorsById = new Map(CONNECTORS.map((c) => [c.id, c]));

export function getConnector(appType: string): AppConnector | undefined {
  return connectorsById.get(appType);
}

export function listConnectors(): AppConnector[] {
  return CONNECTORS;
}

/**
 * A live connection: a registered connector paired with the decrypted config
 * for one `app_connections` row, plus which of its tools are enabled.
 */
export interface ActiveConnection {
  connectionId: string;
  connectionName: string;
  connector: AppConnector;
  config: ConnectorConfig;
  enabledToolNames: Set<string>;
}

export interface AggregatedTool {
  connectionId: string;
  connectionName: string;
  definition: ToolDefinition;
}

/**
 * Builds the flat list of tools exposed over MCP: only from enabled
 * connections, and only tools not explicitly disabled for that connection.
 */
export function aggregateTools(connections: ActiveConnection[]): AggregatedTool[] {
  const tools: AggregatedTool[] = [];
  for (const conn of connections) {
    for (const definition of conn.connector.getTools(conn.config)) {
      if (!conn.enabledToolNames.has(definition.name)) continue;
      tools.push({
        connectionId: conn.connectionId,
        connectionName: conn.connectionName,
        definition,
      });
    }
  }
  return tools;
}
