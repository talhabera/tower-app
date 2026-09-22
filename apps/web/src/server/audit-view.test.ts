import { describe, expect, it } from "vitest";
import { auditDisplayStatus } from "./audit-view";

const t0 = Date.UTC(2026, 8, 22, 12, 0, 0);

describe("auditDisplayStatus", () => {
  it("5 dakikadan eski pending 'interrupted' olur", () => {
    expect(auditDisplayStatus({ status: "pending", createdAt: new Date(t0) }, t0 + 5 * 60_000 + 1)).toBe("interrupted");
  });
  it("taze pending pending kalır", () => {
    expect(auditDisplayStatus({ status: "pending", createdAt: new Date(t0) }, t0 + 60_000)).toBe("pending");
  });
  it("ok/failed olduğu gibi döner", () => {
    expect(auditDisplayStatus({ status: "ok", createdAt: new Date(t0) }, t0 + 10 * 60_000)).toBe("ok");
    expect(auditDisplayStatus({ status: "failed", createdAt: new Date(t0) }, t0)).toBe("failed");
  });
});
