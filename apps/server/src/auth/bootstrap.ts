import { prisma } from "../db.js";
import { env } from "../env.js";
import { hashPassword } from "./password.js";

/** On first run (no users in the DB), seeds the initial admin from env vars. */
export async function bootstrapAdmin(): Promise<void> {
  const userCount = await prisma.user.count();
  if (userCount > 0) return;

  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
  await prisma.user.create({
    data: {
      username: env.ADMIN_USERNAME,
      email: env.ADMIN_EMAIL,
      passwordHash,
      role: "admin",
      status: "active",
      mustChangePassword: true,
    },
  });

  console.log(`[bootstrap] Created initial admin user "${env.ADMIN_USERNAME}"`);
}
