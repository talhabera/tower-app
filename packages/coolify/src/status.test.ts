import { describe, expect, it } from "vitest";
import { parseStatus } from "./status";

describe("parseStatus", () => {
  it("running:healthy ayrıştırır", () => {
    expect(parseStatus("running:healthy")).toEqual({
      raw: "running:healthy",
      state: "running",
      health: "healthy",
    });
  });

  it("exited:unhealthy ayrıştırır", () => {
    expect(parseStatus("exited:unhealthy")).toEqual({
      raw: "exited:unhealthy",
      state: "exited",
      health: "unhealthy",
    });
  });

  it("running:unknown'ı sağlıklı SAYMAZ", () => {
    const s = parseStatus("running:unknown");
    expect(s.state).toBe("running");
    expect(s.health).toBe("unknown");
  });

  it("sağlık eki olmayan durumu unknown sağlık ile döner", () => {
    expect(parseStatus("running")).toEqual({
      raw: "running",
      state: "running",
      health: "unknown",
    });
  });

  it("boş girdiyi unknown/unknown yapar", () => {
    expect(parseStatus(null)).toEqual({ raw: "", state: "unknown", health: "unknown" });
    expect(parseStatus(undefined).state).toBe("unknown");
  });

  it("tanınmayan durumu unknown'a düşürür", () => {
    expect(parseStatus("zıplıyor:healthy").state).toBe("unknown");
  });
});
