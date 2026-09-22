import { afterEach, describe, expect, it } from "vitest";
import { appUrl, callbackCurrentUrl, sessionIdentity } from "./oidc";

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
  it("sub boş/eksikse reddeder", () => {
    expect(sessionIdentity({})).toBeNull();
    expect(sessionIdentity({ sub: "" })).toBeNull();
    expect(sessionIdentity({ sub: "   " })).toBeNull();
    expect(sessionIdentity({ sub: 42 })).toBeNull();
  });

  it("claim'lerden kimlik üretir", () => {
    expect(sessionIdentity({ sub: "u1", email: "a@example.com", name: "A" })).toEqual({
      sub: "u1",
      email: "a@example.com",
      name: "A",
    });
  });

  it("doğrulanmamış e-postayı oturuma taşımaz (yazıcı kontrolü boş e-postayı reddeder)", () => {
    expect(sessionIdentity({ sub: "u1", email: "ops@example.com", email_verified: false })).toEqual({
      sub: "u1",
      email: "",
      name: "",
    });
  });
});
