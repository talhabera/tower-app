import { NextResponse, type NextRequest } from "next/server";
import * as client from "openid-client";
import { oidcConfig } from "@/server/oidc";
import { SESSION_COOKIE, sealSession, sessionCookieOptions } from "@/server/session";

export async function GET(request: NextRequest) {
  const codeVerifier = request.cookies.get("tower_pkce")?.value;
  const expectedState = request.cookies.get("tower_state")?.value;
  const secret = process.env.TOWER_SESSION_SECRET;

  if (!codeVerifier || !expectedState || !secret) {
    return NextResponse.redirect(new URL("/giris-hatasi", request.url));
  }

  const config = await oidcConfig();
  let claims: Record<string, unknown>;
  try {
    const tokens = await client.authorizationCodeGrant(config, new URL(request.url), {
      pkceCodeVerifier: codeVerifier,
      expectedState,
    });
    claims = (tokens.claims() ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.redirect(new URL("/giris-hatasi", request.url));
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
  response.cookies.delete("tower_pkce");
  response.cookies.delete("tower_state");
  return response;
}
