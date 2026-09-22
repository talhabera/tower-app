import { describe, expect, it, vi } from "vitest";
import type { TowerStore } from "@tower/db";
import { enableBackup, hasActiveSchedule, protectAll, type BackupPorts } from "./backups";

const input = { frequency: "0 3 * * *", s3StorageUuid: "s3-1", keepLocal: 7, keepS3: 30 };
const writers = "ops@example.com";
const actor = "ops@example.com";

function store() {
  let n = 0;
  const appended: Array<Record<string, unknown>> = [];
  const finished: Array<Record<string, unknown>> = [];
  const s: TowerStore = {
    appendAudit: vi.fn(async (e) => {
      appended.push(e as Record<string, unknown>);
      return `a${++n}`;
    }),
    finishAudit: vi.fn(async (id, f) => {
      finished.push({ id, ...f });
    }),
    listAudit: vi.fn(),
    getBackupPreset: vi.fn(),
    upsertBackupPreset: vi.fn(),
    close: vi.fn(),
  };
  return { s, appended, finished };
}

function ports(existing: Record<string, boolean>, failing: string[] = []): BackupPorts {
  return {
    getBackups: vi.fn(async (uuid) => ({
      ok: true as const,
      value: existing[uuid] ? [{ uuid: "b", enabled: true, frequency: "daily", saveToS3: true }] : [],
    })),
    create: vi.fn(async (uuid) =>
      failing.includes(uuid)
        ? { ok: false as const, error: { kind: "unreachable" as const, message: "x" } }
        : { ok: true as const, value: { uuid: `sch-${uuid}` } },
    ),
  };
}

describe("hasActiveSchedule", () => {
  it("yalnızca etkin program sayılır", () => {
    expect(hasActiveSchedule([])).toBe(false);
    expect(hasActiveSchedule([{ uuid: "b", enabled: false, frequency: "daily", saveToS3: true }])).toBe(false);
    expect(hasActiveSchedule([{ uuid: "b", enabled: true, frequency: "daily", saveToS3: false }])).toBe(true);
  });
});

describe("enableBackup", () => {
  it("zaten etkin program varsa skipped; yazma ve denetim yok", async () => {
    const { s, appended } = store();
    const p = ports({ "db-1": true });
    const row = await enableBackup({ store: s, writers }, p, actor, { uuid: "db-1", name: "pg" }, input);
    expect(row).toEqual({ uuid: "db-1", name: "pg", status: "skipped" });
    expect(p.create).not.toHaveBeenCalled();
    expect(appended).toHaveLength(0);
  });

  it("programı oluşturur ve backup.create denetim satırı yazar", async () => {
    const { s, appended, finished } = store();
    const p = ports({});
    const row = await enableBackup({ store: s, writers }, p, actor, { uuid: "db-1", name: "pg" }, input);
    expect(row).toEqual({ uuid: "db-1", name: "pg", status: "ok" });
    expect(p.create).toHaveBeenCalledWith("db-1", input);
    expect(appended[0]).toMatchObject({ action: "backup.create", target: "db-1", payload: input });
    expect(finished[0]).toMatchObject({ status: "ok", result: { uuid: "sch-db-1" } });
  });

  it("yedek listesi okunamazsa denemeden failed döner", async () => {
    const { s } = store();
    const p: BackupPorts = {
      getBackups: vi.fn(async () => ({ ok: false as const, error: { kind: "unreachable" as const, message: "x" } })),
      create: vi.fn(),
    };
    const row = await enableBackup({ store: s, writers }, p, actor, { uuid: "db-1", name: "pg" }, input);
    expect(row).toMatchObject({ status: "failed", error: { kind: "unreachable" } });
    expect(p.create).not.toHaveBeenCalled();
  });
});

describe("protectAll", () => {
  const dbs = [
    { uuid: "db-1", name: "a" },
    { uuid: "db-2", name: "b" },
    { uuid: "db-3", name: "c" },
  ];

  it("sırayla işler, çocuk satırları ebeveyne bağlar, atlananı skipped sayar", async () => {
    const { s, appended, finished } = store();
    const p = ports({ "db-2": true });
    const { outcome, rows } = await protectAll({ store: s, writers }, p, actor, dbs, input);

    expect(rows.map((r) => r.status)).toEqual(["ok", "skipped", "ok"]);
    expect(outcome.ok).toBe(true);
    expect(appended[0]).toMatchObject({ action: "backup.protect_all", target: null });
    expect(appended.slice(1).every((e) => e.parentId === "a1")).toBe(true);
    expect(finished.at(-1)).toMatchObject({ id: "a1", status: "ok" });
  });

  it("bir veritabanı başarısızsa ebeveyn partial ile failed olur; diğerleri yine işlenir", async () => {
    const { s, finished } = store();
    const p = ports({}, ["db-2"]);
    const { outcome, rows } = await protectAll({ store: s, writers }, p, actor, dbs, input);
    expect(rows.map((r) => r.status)).toEqual(["ok", "failed", "ok"]);
    expect(outcome).toMatchObject({ ok: false, error: { kind: "partial" } });
    expect(finished.at(-1)).toMatchObject({ id: "a1", status: "failed", errorKind: "partial" });
  });

  it("yazıcı değilse hiçbir şey denemez", async () => {
    const { s, appended } = store();
    const p = ports({});
    const { outcome, rows } = await protectAll({ store: s, writers }, p, "x@example.com", dbs, input);
    expect(outcome).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(rows).toEqual([]);
    expect(appended).toHaveLength(0);
    expect(p.create).not.toHaveBeenCalled();
  });
});
