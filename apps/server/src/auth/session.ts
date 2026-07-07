import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { env } from "../env.js";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    role?: "admin" | "member";
    csrfToken?: string;
  }
}

const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL });
const PgSessionStore = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgSessionStore({ pool: pgPool, tableName: "session", createTableIfMissing: true }),
  secret: env.SESSION_SECRET,
  name: "geektastic.sid",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
});

export function ensureCsrfToken(sessionData: session.Session): string {
  if (!sessionData.csrfToken) {
    sessionData.csrfToken = randomBytes(24).toString("hex");
  }
  return sessionData.csrfToken;
}
