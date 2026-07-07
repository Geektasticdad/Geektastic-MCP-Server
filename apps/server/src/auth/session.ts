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
    // Tied to TRUST_PROXY, not NODE_ENV: a `Secure` cookie is silently dropped
    // by browsers over a plain HTTP connection, which is the default for a
    // direct Portainer deployment with no reverse proxy in front of it. Set
    // TRUST_PROXY=true (and put a TLS-terminating reverse proxy in front) to
    // re-enable secure cookies.
    secure: env.TRUST_PROXY,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
});

export function ensureCsrfToken(sessionData: session.Session & Partial<session.SessionData>): string {
  if (!sessionData.csrfToken) {
    sessionData.csrfToken = randomBytes(24).toString("hex");
  }
  return sessionData.csrfToken;
}
