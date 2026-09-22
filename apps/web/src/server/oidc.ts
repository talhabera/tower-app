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
