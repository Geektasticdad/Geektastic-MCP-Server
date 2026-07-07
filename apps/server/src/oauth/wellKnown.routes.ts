import { Router } from "express";
import { buildAuthorizationServerMetadata, buildProtectedResourceMetadata } from "./metadata.js";

/** No auth, no session — must be reachable by any client attempting OAuth discovery. */
export const wellKnownRouter = Router();

wellKnownRouter.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json(buildAuthorizationServerMetadata());
});

wellKnownRouter.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json(buildProtectedResourceMetadata());
});
