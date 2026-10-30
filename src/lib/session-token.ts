/**
 * Edge-safe session token helpers (used by middleware and server code).
 * The session is a signed JWT stored in an httpOnly cookie and only carries
 * the user id; roles and permissions are always re-read from the database so
 * changes take effect immediately.
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "tf_session";

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short. Set it in your .env file.");
  }
  return new TextEncoder().encode(secret);
}

export function sessionHours() {
  const h = Number(process.env.SESSION_HOURS ?? 12);
  return Number.isFinite(h) && h > 0 ? h : 12;
}

export type SessionPayload = { sub: string; sid: string };

export async function signSession(userId: string) {
  return new SignJWT({ sid: crypto.randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${sessionHours()}h`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { sub: payload.sub, sid: String(payload.sid ?? "") };
  } catch {
    return null;
  }
}
