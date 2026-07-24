import type { AppConnector, ConnectorConfig, PromptDefinition, ToolDefinition } from "./types.js";
import { geektasticRealmsConnector } from "./geektastic/index.js";
import { familyTreeConnector } from "./family-tree/index.js";

/**
 * All connectors known to this build. Add a new app here after implementing
 * `AppConnector` under packages/connectors/src/<app>/.
 */
const CONNECTORS: AppConnector[] = [geektasticRealmsConnector, familyTreeConnector];

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
  enabledPromptNames: Set<string>;
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

export interface AggregatedPrompt {
  connectionId: string;
  connectionName: string;
  definition: PromptDefinition;
}

/**
 * Builds the flat list of prompts exposed over MCP: only from enabled
 * connections/connectors that contribute prompts, and only prompts not
 * explicitly disabled for that connection. If two active connections
 * contribute a prompt with the same name (e.g. two geektastic-realms
 * connections), the first one wins — mirrors aggregateTools' existing
 * behavior for the same latent multi-connection collision case.
 */
export function aggregatePrompts(connections: ActiveConnection[]): AggregatedPrompt[] {
  const seen = new Set<string>();
  const prompts: AggregatedPrompt[] = [];
  for (const conn of connections) {
    if (!conn.connector.getPrompts) continue;
    for (const definition of conn.connector.getPrompts(conn.config)) {
      if (!conn.enabledPromptNames.has(definition.name)) continue;
      if (seen.has(definition.name)) continue;
      seen.add(definition.name);
      prompts.push({
        connectionId: conn.connectionId,
        connectionName: conn.connectionName,
        definition,
      });
    }
  }
  return prompts;
}
