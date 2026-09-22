import { describe, expect, it } from "vitest";
import { isWriter, parseEmailList } from "./writers";

describe("writers", () => {
  it("listeyi kırpar, küçük harfe çevirir, boşları atar", () => {
    expect(parseEmailList(" Ops@Example.com, ,a@b.co ")).toEqual(new Set(["ops@example.com", "a@b.co"]));
  });

  it("tanımsız veya boş liste kimseyi yazıcı yapmaz (fail closed)", () => {
    expect(isWriter("ops@example.com", undefined)).toBe(false);
    expect(isWriter("ops@example.com", " , ")).toBe(false);
  });

  it("listedeki e-posta büyük/küçük harf duyarsız eşleşir; boş e-posta asla yazıcı değildir", () => {
    expect(isWriter("OPS@example.com", "ops@example.com")).toBe(true);
    expect(isWriter("other@example.com", "ops@example.com")).toBe(false);
    expect(isWriter("", "ops@example.com")).toBe(false);
  });
});
