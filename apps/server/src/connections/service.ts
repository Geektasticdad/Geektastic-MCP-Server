import { prisma } from "../db.js";
import { decryptSecret, encryptSecret } from "../crypto/secrets.js";
import { getConnector, listConnectors, type ActiveConnection, type ConnectorConfig } from "@geektastic/connectors";

/** Loads all enabled connections, decrypts their config, and resolves per-tool/prompt enable flags. */
export async function loadActiveConnections(): Promise<ActiveConnection[]> {
  const rows = await prisma.appConnection.findMany({
    where: { enabled: true },
    include: { toolSettings: true, promptSettings: true },
  });

  const active: ActiveConnection[] = [];
  for (const row of rows) {
    const connector = getConnector(row.appType);
    if (!connector) continue;

    const credentials = decryptSecret<Record<string, unknown>>(row.encryptedCredentials);
    const config: ConnectorConfig = { baseUrl: row.baseUrl, ...credentials };

    const disabledTools = new Set(row.toolSettings.filter((t) => !t.enabled).map((t) => t.toolName));
    const allToolNames = connector.getTools(config).map((t) => t.name);
    const enabledToolNames = new Set(allToolNames.filter((name) => !disabledTools.has(name)));

    const disabledPrompts = new Set(row.promptSettings.filter((p) => !p.enabled).map((p) => p.promptName));
    const allPromptNames = (connector.getPrompts?.(config) ?? []).map((p) => p.name);
    const enabledPromptNames = new Set(allPromptNames.filter((name) => !disabledPrompts.has(name)));

    active.push({
      connectionId: row.id,
      connectionName: row.name,
      connector,
      config,
      enabledToolNames,
      enabledPromptNames,
    });
  }
  return active;
}

export function encryptCredentials(credentials: Record<string, unknown>): string {
  return encryptSecret(credentials);
}

export { getConnector, listConnectors };
