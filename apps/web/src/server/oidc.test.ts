import { afterEach, describe, expect, it } from "vitest";
import { appUrl, callbackCurrentUrl, parseAllowedEmails, sessionIdentity } from "./oidc";

const ORIGINAL_TOWER_BASE_URL = process.env.TOWER_BASE_URL;

afterEach(() => {
  if (ORIGINAL_TOWER_BASE_URL === undefined) delete process.env.TOWER_BASE_URL;
  else process.env.TOWER_BASE_URL = ORIGINAL_TOWER_BASE_URL;
});

describe("callbackCurrentUrl", () => {
  it("gelen isteğin host'unu değil TOWER_BASE_URL'i kullanır, yalnızca sorgu dizesini kopyalar", () => {
    process.env.TOWER_BASE_URL = "https://tower.example.com";

    const result = callbackCurrentUrl("http://10.0.0.5:3000/api/auth/callback?code=x&state=y");

    expect(result.href).toBe("https://tower.example.com/api/auth/callback?code=x&state=y");
  });

  it("TOWER_BASE_URL tanımsızsa localhost'a düşer", () => {
    delete process.env.TOWER_BASE_URL;

    const result = callbackCurrentUrl("http://10.0.0.5:3000/api/auth/callback?code=abc");

    expect(result.href).toBe("http://localhost:3000/api/auth/callback?code=abc");
  });
});

describe("appUrl", () => {
  it("yolu TOWER_BASE_URL üzerine kurar (sondaki / tekrarlanmaz)", () => {
    process.env.TOWER_BASE_URL = "https://tower.example.com/";
    expect(appUrl("/giris-hatasi?durum=cikis").href).toBe(
      "https://tower.example.com/giris-hatasi?durum=cikis",
    );
  });
});

describe("sessionIdentity", () => {
  it("sub boş veya eksikse girişi reddeder", () => {
    expect(sessionIdentity({}, undefined)).toBeNull();
    expect(sessionIdentity({ sub: "" }, undefined)).toBeNull();
    expect(sessionIdentity({ sub: "   " }, undefined)).toBeNull();
    expect(sessionIdentity({ sub: 42 }, undefined)).toBeNull();
  });

  it("allowlist tanımsızsa her NexAuth hesabına izin verir", () => {
    expect(sessionIdentity({ sub: "u1", email: "a@example.com", name: "A" }, undefined)).toEqual({
      sub: "u1",
      email: "a@example.com",
      name: "A",
    });
    expect(sessionIdentity({ sub: "u1" }, " , ")).not.toBeNull();
  });

  it("allowlist tanımlıysa yalnızca listedeki e-postalar girer (büyük/küçük harf duyarsız)", () => {
    const allow = "ops@example.com, Admin@Example.com";
    expect(sessionIdentity({ sub: "u1", email: "admin@example.com" }, allow)).not.toBeNull();
    expect(sessionIdentity({ sub: "u2", email: "other@example.com" }, allow)).toBeNull();
    expect(sessionIdentity({ sub: "u3" }, allow)).toBeNull();
  });

  it("allowlist varken doğrulanmamış e-posta reddedilir", () => {
    expect(
      sessionIdentity({ sub: "u1", email: "ops@example.com", email_verified: false }, "ops@example.com"),
    ).toBeNull();
  });

  it("parseAllowedEmails boş listeyi null sayar", () => {
    expect(parseAllowedEmails(undefined)).toBeNull();
    expect(parseAllowedEmails("")).toBeNull();
    expect(parseAllowedEmails("A@x.com,b@x.com")).toEqual(new Set(["a@x.com", "b@x.com"]));
  });
});
