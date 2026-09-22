import { NextResponse, type NextRequest } from "next/server";
import * as client from "openid-client";
import { appUrl, baseUrl, callbackCurrentUrl, oidcConfig, sessionIdentity } from "@/server/oidc";
import { PKCE_COOKIE, SESSION_COOKIE, STATE_COOKIE, sealSession, sessionCookieOptions } from "@/server/session";

const SESSION_SECONDS = 8 * 60 * 60;

/** PKCE/state çerezleri tek kullanımlıktır: her çıkış yolunda (başarı da dahil) silinir. */
function clearTempCookies(response: NextResponse): NextResponse {
  response.cookies.delete(PKCE_COOKIE);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

function fail(durum?: "yetkisiz"): NextResponse {
  const path = durum ? `/giris-hatasi?durum=${durum}` : "/giris-hatasi";
  return clearTempCookies(NextResponse.redirect(appUrl(path)));
}

export async function GET(request: NextRequest) {
  const codeVerifier = request.cookies.get(PKCE_COOKIE)?.value;
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const secret = process.env.TOWER_SESSION_SECRET;

  if (!codeVerifier || !expectedState || !secret) return fail();

  let claims: Record<string, unknown>;
  try {
    // Discovery hatası da dahil: her hata /giris-hatasi'na gider, 500 değil.
    const config = await oidcConfig();
    const tokens = await client.authorizationCodeGrant(config, callbackCurrentUrl(request.url), {
      pkceCodeVerifier: codeVerifier,
      expectedState,
    });
    claims = (tokens.claims() ?? {}) as Record<string, unknown>;
  } catch {
    return fail();
  }

  const identity = sessionIdentity(claims, process.env.TOWER_ALLOWED_EMAILS);
  if (!identity) return fail("yetkisiz");

  let token: string;
  try {
    token = await sealSession({ ...identity, expiresAt: Date.now() + SESSION_SECONDS * 1000 }, secret);
  } catch {
    return fail();
  }

  const response = NextResponse.redirect(appUrl("/"));
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(baseUrl(), SESSION_SECONDS));
  return clearTempCookies(response);
}
