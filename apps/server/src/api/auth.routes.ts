import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { requireAuth, requireCsrf } from "../auth/middleware.js";
import { ensureCsrfToken } from "../auth/session.js";
import type { PublicUser } from "@geektastic/shared";

export const authRouter = Router();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

function toPublicUser(user: {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role as PublicUser["role"],
    status: user.status as PublicUser["status"],
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

// GET /api/auth/csrf -- fetch (or create) the CSRF token to echo back on mutating requests
authRouter.get("/csrf", (req, res) => {
  const token = ensureCsrfToken(req.session);
  res.json({ csrfToken: token });
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", loginRateLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { username, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.status === "disabled") {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ error: "Could not start session" });
      return;
    }
    req.session.userId = user.id;
    req.session.role = user.role;
    // regenerate() wipes the prior session (including its csrfToken) to prevent
    // session fixation, so a fresh one is established here and handed back
    // directly -- otherwise the client keeps using its now-stale cached token
    // and every CSRF-protected request fails until the page is reloaded.
    const csrfToken = ensureCsrfToken(req.session);
    res.json({ user: toPublicUser(user), csrfToken });
  });
});

authRouter.post("/logout", requireAuth, requireCsrf, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("geektastic.sid");
    res.status(204).end();
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.userId! } });
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ user: toPublicUser(user) });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.post("/change-password", requireAuth, requireCsrf, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId! } });
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  res.status(204).end();
});
