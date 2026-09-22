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

/**
 * Uygulamanın dış adresi. Yönlendirmeler ve çerez `secure` bayrağı bundan
 * türetilir — gelen isteğin Host başlığından (request.url) DEĞİL.
 */
export function baseUrl(): string {
  return (process.env.TOWER_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** `path`'i TOWER_BASE_URL üzerine kurar (ör. "/giris-hatasi?durum=cikis"). */
export function appUrl(path: string): URL {
  return new URL(path, `${baseUrl()}/`);
}

export function callbackUrl(): string {
  return `${baseUrl()}/api/auth/callback`;
}

export type SessionIdentity = { sub: string; email: string; name: string };

/** Virgülle ayrılmış e-posta listesi; boş/tanımsızsa null (= tüm NexAuth hesapları). */
export function parseAllowedEmails(raw: string | undefined): Set<string> | null {
  const list = (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? new Set(list) : null;
}

/**
 * ID token claim'lerinden oturum kimliği üretir; giriş reddedilecekse null döner.
 * - `sub` boş/eksikse reddedilir.
 * - TOWER_ALLOWED_EMAILS tanımlıysa yalnızca listedeki (ve doğrulanmamış
 *   işaretlenmemiş) e-postalar girebilir; tanımsızsa tüm NexAuth hesapları girer.
 */
export function sessionIdentity(
  claims: Record<string, unknown>,
  allowedEmailsRaw: string | undefined,
): SessionIdentity | null {
  const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
  if (!sub) return null;
  const email = typeof claims.email === "string" ? claims.email.trim() : "";
  const name = typeof claims.name === "string" ? claims.name : "";

  const allowed = parseAllowedEmails(allowedEmailsRaw);
  if (allowed) {
    if (!email || !allowed.has(email.toLowerCase())) return null;
    if (claims.email_verified === false) return null;
  }
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
