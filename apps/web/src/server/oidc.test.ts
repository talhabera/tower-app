import { afterEach, describe, expect, it } from "vitest";
import { callbackCurrentUrl } from "./oidc";

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
