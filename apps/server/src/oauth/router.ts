import { Router } from "express";
import { registerRouter } from "./register.routes.js";
import { authorizeRouter } from "./authorize.routes.js";
import { tokenRouter } from "./token.routes.js";

export const oauthRouter = Router();

oauthRouter.use(registerRouter);
oauthRouter.use(authorizeRouter);
oauthRouter.use(tokenRouter);
