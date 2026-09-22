import { describe, expect, it } from "vitest";
import { err, isOk, ok } from "./result";

describe("Result", () => {
  it("ok değeri taşır", () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it("err türü ve mesajı taşır", () => {
    const r = err("unauthorized", "token geçersiz", 401);
    expect(isOk(r)).toBe(false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("unauthorized");
      expect(r.error.status).toBe(401);
      expect(r.error.message).toBe("token geçersiz");
    }
  });
});
