import { NextResponse } from "next/server";
import * as client from "openid-client";
import { appUrl, baseUrl, callbackUrl, oidcConfig } from "@/server/oidc";
import { PKCE_COOKIE, STATE_COOKIE, sessionCookieOptions } from "@/server/session";

export async function GET() {
  let config: client.Configuration;
  try {
    // Eksik env veya discovery hatası 500 değil, giriş hatası sayfası verir.
    config = await oidcConfig();
  } catch {
    return NextResponse.redirect(appUrl("/giris-hatasi"));
  }

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl(),
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  const response = NextResponse.redirect(url.href);
  const options = sessionCookieOptions(baseUrl(), 600);
  response.cookies.set(PKCE_COOKIE, codeVerifier, options);
  response.cookies.set(STATE_COOKIE, state, options);
  return response;
}
