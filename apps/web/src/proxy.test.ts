import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { proxy } from "./proxy";
import { SESSION_COOKIE } from "@/server/session";

function redirectLocation(response: ReturnType<typeof proxy>): string | null {
  return response.headers.get("location");
}

describe("proxy", () => {
  it("oturum çerezi yoksa girişe yönlendirir (TOWER_BASE_URL yoksa localhost)", () => {
    delete process.env.TOWER_BASE_URL;
    const request = new NextRequest("https://tower.example.com/panel");
    expect(redirectLocation(proxy(request))).toBe("http://localhost:3000/api/auth/login");
  });

  it("oturum çerezi varsa geçit verir", () => {
    const request = new NextRequest("https://tower.example.com/panel", {
      headers: { cookie: `${SESSION_COOKIE}=deger` },
    });
    expect(redirectLocation(proxy(request))).toBeNull();
  });

  it("/api/auth altındaki yollar oturumsuz erişilebilir", () => {
    const request = new NextRequest("https://tower.example.com/api/auth/login");
    expect(redirectLocation(proxy(request))).toBeNull();
  });

  it("/giris-hatasi oturumsuz erişilebilir (yönlendirme döngüsü yok)", () => {
    const request = new NextRequest("https://tower.example.com/giris-hatasi");
    expect(redirectLocation(proxy(request))).toBeNull();
  });

  it("/api/authX gibi benzer yollar herkese açık sayılmaz", () => {
    delete process.env.TOWER_BASE_URL;
    const request = new NextRequest("https://tower.example.com/api/authX");
    expect(redirectLocation(proxy(request))).toBe("http://localhost:3000/api/auth/login");
  });
});

describe("proxy TOWER_BASE_URL", () => {
  const original = process.env.TOWER_BASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.TOWER_BASE_URL;
    else process.env.TOWER_BASE_URL = original;
  });

  it("girişe yönlendirmeyi Host başlığından değil TOWER_BASE_URL'den kurar", () => {
    process.env.TOWER_BASE_URL = "https://tower.example.com/";
    const request = new NextRequest("http://10.0.0.5:3000/filo");
    expect(proxy(request).headers.get("location")).toBe("https://tower.example.com/api/auth/login");
  });
});
