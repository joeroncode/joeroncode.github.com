import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface AuthTokenPayload {
  sub: string;
  organizationId: string;
  role: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(payload: AuthTokenPayload): { token: string; expiresIn: number } {
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN_SECONDS });
  return { token, expiresIn: env.JWT_EXPIRES_IN_SECONDS };
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}
