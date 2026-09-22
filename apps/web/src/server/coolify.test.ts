import { describe, expect, it } from "vitest";
import { buildCoolify } from "./coolify";

describe("buildCoolify", () => {
  it("env eksikse hata döner", () => {
    const r = buildCoolify({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("malformed");
  });

  it("env tamsa istemci döner", () => {
    const r = buildCoolify({ COOLIFY_URL: "https://panel.example.app", COOLIFY_TOKEN: "t" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(typeof r.value.get).toBe("function");
  });
});
