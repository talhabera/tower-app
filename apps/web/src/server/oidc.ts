import "server-only";
import * as client from "openid-client";

let cached: client.Configuration | null = null;

export async function oidcConfig(): Promise<client.Configuration> {
  if (cached) return cached;
  const issuer = process.env.NEXAUTH_ISSUER;
  const clientId = process.env.TOWER_OIDC_CLIENT_ID;
  const clientSecret = process.env.TOWER_OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) {
    throw new Error("NEXAUTH_ISSUER / TOWER_OIDC_CLIENT_ID / TOWER_OIDC_CLIENT_SECRET eksik");
  }
  cached = await client.discovery(new URL(issuer), clientId, clientSecret);
  return cached;
}

export function callbackUrl(): string {
  const base = process.env.TOWER_BASE_URL ?? "http://localhost:3000";
  return `${base}/api/auth/callback`;
}
