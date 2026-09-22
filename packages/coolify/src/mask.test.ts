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
});
