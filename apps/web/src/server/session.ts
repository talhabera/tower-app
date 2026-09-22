import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CompactEncrypt, compactDecrypt } from "jose";

export const SESSION_COOKIE = "tower_session";
export const PKCE_COOKIE = "tower_pkce";
export const STATE_COOKIE = "tower_state";

export type TowerSession = {
  sub: string;
  email: string;
  name: string;
  /** epoch ms */
  expiresAt: number;
};

/** Anahtar sırrın TAMAMINDAN SHA-256 ile türetilir (kesme yok). */
function keyFrom(secret: string): Uint8Array {
  if (new TextEncoder().encode(secret).length < 32) {
    throw new Error("TOWER_SESSION_SECRET en az 32 bayt olmalı");
  }
  return new Uint8Array(createHash("sha256").update(secret, "utf8").digest());
}

export async function sealSession(session: TowerSession, secret: string): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(session));
  return new CompactEncrypt(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(keyFrom(secret));
}

export async function unsealSession(
  token: string,
  secret: string,
): Promise<TowerSession | null> {
  try {
    const { plaintext } = await compactDecrypt(token, keyFrom(secret));
    const session = JSON.parse(new TextDecoder().decode(plaintext)) as TowerSession;
    if (typeof session.expiresAt !== "number" || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

/** localhost'ta http üzerinden çalışabilmek için `secure` bayrağı yalnızca localhost dışında açılır. */
export function isLocalHost(url: string): boolean {
  const { hostname } = new URL(url);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function sessionCookieOptions(url: string, maxAgeSeconds: number) {
  return {
    httpOnly: true as const,
    secure: !isLocalHost(url),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function requireSession(): Promise<TowerSession> {
  const secret = process.env.TOWER_SESSION_SECRET;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = secret && token ? await unsealSession(token, secret) : null;
  if (!session) redirect("/api/auth/login");
  return session;
}
