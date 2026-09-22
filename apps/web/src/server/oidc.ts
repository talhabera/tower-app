import "server-only";
import * as client from "openid-client";
import { appUrl, baseUrl } from "./base-url";

export { appUrl, baseUrl };

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
  return `${baseUrl()}/api/auth/callback`;
}

export type SessionIdentity = { sub: string; email: string; name: string };

/**
 * ID token claim'lerinden oturum kimliği üretir; giriş reddedilecekse null döner.
 * - `sub` boş/eksikse reddedilir.
 * - Giriş yetkisi NexAuth'taki uygulama grant'idir; burada allowlist yoktur.
 * - E-posta ve ad yalnızca `email_verified === true` ise oturuma taşınır;
 *   claim eksikse veya `false` ise e-posta/ad boş kalır: yazıcı kontrolü
 *   (isWriter) boş e-postayı her zaman reddeder.
 */
export function sessionIdentity(claims: Record<string, unknown>): SessionIdentity | null {
  const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
  if (!sub) return null;
  const verified = claims.email_verified === true;
  const email = verified && typeof claims.email === "string" ? claims.email.trim() : "";
  const name = verified && typeof claims.name === "string" ? claims.name : "";
  return { sub, email, name };
}

/**
 * openid-client v6 derives the redirect_uri it sends to the token endpoint from the
 * origin+path of the `currentUrl` passed to `authorizationCodeGrant` (it strips the
 * query string and uses the rest as-is — see `stripParams` in openid-client's source).
 * The incoming request's own URL is untrustworthy for this (proxies, forwarded hosts,
 * a spoofed Host header) and will not match the redirect_uri registered with the OIDC
 * client unless it happens to equal TOWER_BASE_URL. So we always rebuild the URL from
 * `callbackUrl()` — the same value used to build the authorization request — and copy
 * only the query string (code, state, …) from the real incoming request.
 */
export function callbackCurrentUrl(requestUrl: string): URL {
  const currentUrl = new URL(callbackUrl());
  currentUrl.search = new URL(requestUrl).search;
  return currentUrl;
}
