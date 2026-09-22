import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStore, DEFAULT_PRESET, runMigrations, type TowerStore } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.warn("[@tower/db] TEST_DATABASE_URL yok — entegrasyon testleri ATLANDI. Çalıştırmak için: pnpm --filter @tower/db test:db");
}

describe.skipIf(!url)("TowerStore (Postgres)", () => {
  let store: TowerStore;

  beforeAll(async () => {
    await runMigrations(url!);
    store = createStore(url!);
  });
  afterAll(async () => {
    await store?.close();
  });

  it("appendAudit pending satır yazar, finishAudit kapatır", async () => {
    const id = await store.appendAudit({
      actorEmail: "ops@example.com",
      action: "backup.create",
      target: "db-1",
      payload: { frequency: "0 3 * * *" },
    });
    await store.finishAudit(id, { status: "ok", result: { uuid: "b-1" } });

    const [row] = (await store.listAudit(50)).filter((r) => r.id === id);
    expect(row).toMatchObject({
      actorEmail: "ops@example.com",
      action: "backup.create",
      target: "db-1",
      status: "ok",
      errorKind: null,
      result: { uuid: "b-1" },
      parentId: null,
    });
    expect(row.finishedAt).toBeInstanceOf(Date);
  });

  it("çocuk satır ebeveyne bağlanır", async () => {
    const parent = await store.appendAudit({ actorEmail: "a@b.co", action: "backup.protect_all", target: null, payload: {} });
    const child = await store.appendAudit({ actorEmail: "a@b.co", action: "backup.create", target: "db-2", payload: {}, parentId: parent });
    const [row] = (await store.listAudit(50)).filter((r) => r.id === child);
    expect(row.parentId).toBe(parent);
  });

  it("preset yoksa varsayılanı döner, upsert sonrası yenisini döner", async () => {
    expect(await store.getBackupPreset()).toMatchObject({ frequency: DEFAULT_PRESET.frequency, keepLocal: 7, keepS3: 30 });
    await store.upsertBackupPreset({ frequency: "0 4 * * *", keepLocal: 5, keepS3: 20, s3StorageUuid: "s3-1", updatedBy: "a@b.co" });
    await store.upsertBackupPreset({ frequency: "0 2 * * *", keepLocal: 5, keepS3: 20, s3StorageUuid: "s3-1", updatedBy: "a@b.co" });
    const p = await store.getBackupPreset();
    expect(p).toMatchObject({ frequency: "0 2 * * *", s3StorageUuid: "s3-1", updatedBy: "a@b.co" });
    expect(p.updatedAt).toBeInstanceOf(Date);
  });
});
