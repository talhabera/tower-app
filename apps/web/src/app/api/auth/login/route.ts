import { NextResponse, type NextRequest } from "next/server";
import * as client from "openid-client";
import { callbackUrl, oidcConfig } from "@/server/oidc";
import { PKCE_COOKIE, STATE_COOKIE, sessionCookieOptions } from "@/server/session";

export async function GET(request: NextRequest) {
  const config = await oidcConfig();
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
  const options = sessionCookieOptions(request.url, 600);
  response.cookies.set(PKCE_COOKIE, codeVerifier, options);
  response.cookies.set(STATE_COOKIE, state, options);
  return response;
}
