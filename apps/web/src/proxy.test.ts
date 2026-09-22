import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";
import { SESSION_COOKIE } from "@/server/session";

function redirectLocation(response: ReturnType<typeof proxy>): string | null {
  return response.headers.get("location");
}

describe("proxy", () => {
  it("oturum çerezi yoksa girişe yönlendirir", () => {
    const request = new NextRequest("https://tower.example.com/panel");
    const location = redirectLocation(proxy(request));
    expect(location).toBe("https://tower.example.com/api/auth/login");
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
    const request = new NextRequest("https://tower.example.com/api/authX");
    expect(redirectLocation(proxy(request))).toBe("https://tower.example.com/api/auth/login");
  });
});
