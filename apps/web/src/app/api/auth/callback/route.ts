import { NextResponse, type NextRequest } from "next/server";
import * as client from "openid-client";
import { callbackCurrentUrl, oidcConfig } from "@/server/oidc";
import { PKCE_COOKIE, SESSION_COOKIE, STATE_COOKIE, sealSession, sessionCookieOptions } from "@/server/session";

/** PKCE/state çerezleri tek kullanımlıktır: her çıkış yolunda (başarı da dahil) silinir. */
function clearTempCookies(response: NextResponse): NextResponse {
  response.cookies.delete(PKCE_COOKIE);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const codeVerifier = request.cookies.get(PKCE_COOKIE)?.value;
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const secret = process.env.TOWER_SESSION_SECRET;

  if (!codeVerifier || !expectedState || !secret) {
    return clearTempCookies(NextResponse.redirect(new URL("/giris-hatasi", request.url)));
  }

  const config = await oidcConfig();
  let claims: Record<string, unknown>;
  try {
    const tokens = await client.authorizationCodeGrant(config, callbackCurrentUrl(request.url), {
      pkceCodeVerifier: codeVerifier,
      expectedState,
    });
    claims = (tokens.claims() ?? {}) as Record<string, unknown>;
  } catch {
    return clearTempCookies(NextResponse.redirect(new URL("/giris-hatasi", request.url)));
  }

  const token = await sealSession(
    {
      sub: String(claims.sub ?? ""),
      email: String(claims.email ?? ""),
      name: String(claims.name ?? ""),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    },
    secret,
  );

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request.url, 8 * 60 * 60));
  return clearTempCookies(response);
}
