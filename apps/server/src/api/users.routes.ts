import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { requireAdmin, requireCsrf } from "../auth/middleware.js";
import type { PublicUser } from "@geektastic/shared";

export const usersRouter = Router();
usersRouter.use(requireAdmin);

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

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  res.json({ users: users.map(toPublicUser) });
});

const createUserSchema = z.object({
  username: z.string().min(3).max(64),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "member"]),
});

usersRouter.post("/", requireCsrf, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username, email, password, role } = parsed.data;
  const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (existing) {
    res.status(409).json({ error: "Username or email already in use" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { username, email, passwordHash, role, mustChangePassword: true },
  });
  res.status(201).json({ user: toPublicUser(user) });
});

const updateUserSchema = z.object({
  role: z.enum(["admin", "member"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

usersRouter.patch("/:id", requireCsrf, async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (req.params.id === req.session.userId && parsed.data.status === "disabled") {
    res.status(400).json({ error: "You cannot disable your own account" });
    return;
  }
  const user = await prisma.user.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ user: toPublicUser(user) });
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8),
});

usersRouter.post("/:id/reset-password", requireCsrf, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: req.params.id },
    data: { passwordHash, mustChangePassword: true },
  });
  res.status(204).end();
});
