import { describe, expect, it, vi } from "vitest";
import type { TowerStore } from "@tower/db";

vi.mock("@/server/session", () => ({
  requireSession: vi.fn(async () => ({ email: "ops@example.com" })),
}));
vi.mock("@/server/store", () => ({ getStore: vi.fn() }));
vi.mock("@/server/backup-ports", () => ({
  backupPorts: vi.fn(() => ({ ok: true, value: { getBackups: vi.fn(), create: vi.fn() } })),
  listUnprotected: vi.fn(),
  liveStorages: vi.fn(async () => ({ ok: true, value: [] })),
}));
vi.mock("@/server/dashboard", () => ({
  loadDashboard: Object.assign(vi.fn(), { invalidate: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { getStore } = await import("@/server/store");
const { liveStorages } = await import("@/server/backup-ports");
const { enableBackupAction, protectAllAction } = await import("./actions");

process.env.TOWER_WRITER_EMAILS = "ops@example.com";

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

function storeWithBrokenPreset(): TowerStore {
  return {
    appendAudit: vi.fn(),
    finishAudit: vi.fn(),
    listAudit: vi.fn(),
    getBackupPreset: vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    }),
    upsertBackupPreset: vi.fn(),
    close: vi.fn(),
  };
}

describe("enableBackupAction", () => {
  it("preset okuması Postgres çıkışında patlarsa db-unavailable mesajı döner, Coolify'a gitmez", async () => {
    vi.mocked(getStore).mockReturnValue(storeWithBrokenPreset());
    const r = await enableBackupAction(null, form({ uuid: "db-1", name: "pg" }));
    expect(r).toEqual({ ok: false, message: "Tower veritabanına ulaşılamadı; yazma yapılmadı." });
    expect(liveStorages).not.toHaveBeenCalled();
  });
});

describe("protectAllAction", () => {
  it("preset okuması Postgres çıkışında patlarsa db-unavailable mesajı döner", async () => {
    vi.mocked(getStore).mockReturnValue(storeWithBrokenPreset());
    const r = await protectAllAction(null, form({}));
    expect(r).toEqual({ ok: false, message: "Tower veritabanına ulaşılamadı; yazma yapılmadı." });
  });
});
