import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { usersRouter } from "./users.routes.js";
import { connectionsRouter } from "./connections.routes.js";
import { toolsRouter } from "./tools.routes.js";
import { promptsRouter } from "./prompts.routes.js";
import { tokensRouter } from "./tokens.routes.js";
import { oauthClientsRouter } from "./oauthClients.routes.js";
import { logsRouter } from "./logs.routes.js";
import { promptLogsRouter } from "./promptLogs.routes.js";
import { playgroundRouter } from "./playground.routes.js";
import { dashboardRouter } from "./dashboard.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/connections", connectionsRouter);
apiRouter.use("/tools", toolsRouter);
apiRouter.use("/prompts", promptsRouter);
apiRouter.use("/tokens", tokensRouter);
apiRouter.use("/oauth-clients", oauthClientsRouter);
apiRouter.use("/logs", logsRouter);
apiRouter.use("/prompt-logs", promptLogsRouter);
apiRouter.use("/playground", playgroundRouter);
apiRouter.use("/dashboard", dashboardRouter);
