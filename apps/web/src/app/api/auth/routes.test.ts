import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as callback } from "./callback/route";
import { GET as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { PKCE_COOKIE, SESSION_COOKIE, STATE_COOKIE } from "@/server/session";

const KEYS = [
  "TOWER_BASE_URL",
  "NEXAUTH_ISSUER",
  "TOWER_OIDC_CLIENT_ID",
  "TOWER_OIDC_CLIENT_SECRET",
  "TOWER_SESSION_SECRET",
] as const;
const saved: Partial<Record<(typeof KEYS)[number], string>> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.TOWER_BASE_URL = "https://tower.example.com";
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("auth rotaları", () => {
  it("callback: eksik çerezde Host başlığına değil TOWER_BASE_URL'e göre /giris-hatasi'na gider", async () => {
    const res = await callback(new NextRequest("http://evil.example:3000/api/auth/callback?code=x"));
    expect(res.headers.get("location")).toBe("https://tower.example.com/giris-hatasi");
  });

  it("callback: OIDC yapılandırması eksik/bozuksa 500 değil /giris-hatasi döner ve geçici çerezleri siler", async () => {
    process.env.TOWER_SESSION_SECRET = "x".repeat(32);
    const req = new NextRequest("http://localhost:3000/api/auth/callback?code=x&state=y", {
      headers: { cookie: `${PKCE_COOKIE}=v; ${STATE_COOKIE}=y` },
    });
    const res = await callback(req);
    expect(res.headers.get("location")).toBe("https://tower.example.com/giris-hatasi");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${PKCE_COOKIE}=;`);
    expect(setCookie).toContain(`${STATE_COOKIE}=;`);
  });

  it("login: env eksikse 500 değil /giris-hatasi'na yönlendirir", async () => {
    const res = await login();
    expect(res.headers.get("location")).toBe("https://tower.example.com/giris-hatasi");
  });

  it("logout: oturum çerezini siler ve herkese açık çıkış sayfasına 303 ile iner", async () => {
    const res = await logout();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://tower.example.com/giris-hatasi?durum=cikis");
    expect(res.headers.get("set-cookie") ?? "").toContain(`${SESSION_COOKIE}=;`);
  });
});
