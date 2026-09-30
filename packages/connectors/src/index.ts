export type {
  AppConnector,
  ConnectorConfig,
  HealthCheckResult,
  ToolDefinition,
  ToolAccess,
  PromptArgumentDefinition,
  PromptMessage,
  PromptResult,
  PromptDefinition,
} from "./types.js";
export { getConnector, listConnectors, aggregateTools, aggregatePrompts } from "./registry.js";
export type { ActiveConnection, AggregatedTool, AggregatedPrompt } from "./registry.js";
export { describePrompt, describeTool } from "./toolMeta.js";
export type { ToolMeta } from "./toolMeta.js";
export { geektasticRealmsConnector } from "./geektastic/index.js";
export { familyTreeConnector } from "./family-tree/index.js";
