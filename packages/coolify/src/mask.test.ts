import { describe, expect, it } from "vitest";
import { maskSecrets } from "./mask";

describe("maskSecrets", () => {
  it("KEY=value biçimindeki gizli anahtarları maskeler", () => {
    const out = maskSecrets("COOLIFY_TOKEN=abc123def456ghi789jkl012mno345");
    expect(out).toBe("COOLIFY_TOKEN=***");
    expect(out).not.toContain("abc123");
  });

  it("SECRET ve PASSWORD anahtarlarını da maskeler", () => {
    expect(maskSecrets("APP_SECRET=s3cr3tvalue")).toBe("APP_SECRET=***");
    expect(maskSecrets("DB_PASSWORD=hunter2")).toBe("DB_PASSWORD=***");
  });

  it("veritabanı bağlantı dizesindeki parolayı maskeler", () => {
    expect(maskSecrets("postgres://user:pw123@host:5432/db")).toBe(
      "postgres://user:***@host:5432/db",
    );
  });

  it("Bearer token'ı maskeler", () => {
    expect(maskSecrets("Authorization: Bearer aaaabbbbccccddddeeeeffff")).toBe(
      "Authorization: Bearer ***",
    );
  });

  it("uzun serbest base64/hex dizilerini maskeler", () => {
    expect(maskSecrets("deploy id 4f8a9b2c1d3e5f6a7b8c9d0e1f2a3b4c5d6e7f80")).toContain("***");
  });

  it("normal metni bozmaz", () => {
    const text = "2026-09-20 build başarılı, 12 kaynak tarandı";
    expect(maskSecrets(text)).toBe(text);
  });

  it("lowercase anahtarları maskeler", () => {
    expect(maskSecrets("password=hunter2")).toBe("password=***");
    expect(maskSecrets("api_key=abcd1234")).toBe("api_key=***");
    expect(maskSecrets("token=abc")).toBe("token=***");
  });

  it("lowercase Bearer token'ı maskeler", () => {
    expect(maskSecrets("authorization: bearer abcdef123456")).toBe(
      "authorization: bearer ***",
    );
  });

  it("uppercase BEARER token'ı maskeler", () => {
    expect(maskSecrets("Authorization: BEARER aaaabbbbccccddddeeeeffff")).toBe(
      "Authorization: BEARER ***",
    );
  });

  it("anahtar adının ortasında gizli bilgi anahtarını maskeler", () => {
    expect(maskSecrets("PASSWORD_HASH=x123y456z789a012b345c678d901e234")).toBe(
      "PASSWORD_HASH=***",
    );
    expect(maskSecrets("DB_PASSWORD_FILE=/path/to/secret")).toBe(
      "DB_PASSWORD_FILE=***",
    );
  });

  it("kısa Bearer token'ları da maskeler", () => {
    expect(maskSecrets("authorization: bearer abcdef123")).toBe(
      "authorization: bearer ***",
    );
    expect(maskSecrets("Authorization: BEARER abcdef123")).toBe(
      "Authorization: BEARER ***",
    );
  });

  it("20 karakterlik rastgele dizileri maskeler (spec eşiği)", () => {
    const twenty = "a1b2c3d4e5f6g7h8i9j0";
    expect(twenty).toHaveLength(20);
    expect(maskSecrets(`istek ${twenty} bitti`)).toBe("istek *** bitti");
  });

  it("19 karakterlik diziyi ve rakamsız uzun kelimeleri maskelemez", () => {
    expect(maskSecrets("id a1b2c3d4e5f6g7h8i9 ok")).toBe("id a1b2c3d4e5f6g7h8i9 ok");
    expect(maskSecrets("internationalization-framework")).toBe("internationalization-framework");
  });

  it("parolasız userinfo'daki token'ı maskeler", () => {
    expect(maskSecrets("https://ghp_fake123@github.com/o/r")).toBe("https://***@github.com/o/r");
    expect(maskSecrets("https://x:ghp_fake123@github.com/o/r")).toBe("https://x:***@github.com/o/r");
  });
});
