import { describe, expect, it, vi } from "vitest";
import type { TowerStore } from "@tower/db";
import { performWrite } from "./write";

function fakeStore(overrides: Partial<TowerStore> = {}) {
  const calls: { append: unknown[]; finish: unknown[] } = { append: [], finish: [] };
  const store: TowerStore = {
    appendAudit: vi.fn(async (e) => {
      calls.append.push(e);
      return `audit-${calls.append.length}`;
    }),
    finishAudit: vi.fn(async (id, f) => {
      calls.finish.push({ id, ...f });
    }),
    listAudit: vi.fn(async () => []),
    getBackupPreset: vi.fn(),
    upsertBackupPreset: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
  return { store, calls };
}

const req = { actorEmail: "ops@example.com", action: "backup.create" as const, target: "db-1", payload: { a: 1 } };
const writers = "ops@example.com";

describe("performWrite", () => {
  it("yazıcı değilse forbidden döner; denetim satırı yazmaz, fn çağrılmaz", async () => {
    const { store, calls } = fakeStore();
    const fn = vi.fn();
    const r = await performWrite({ store, writers }, { ...req, actorEmail: "x@example.com" }, fn);
    expect(r).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(calls.append).toHaveLength(0);
    expect(fn).not.toHaveBeenCalled();
  });

  it("store yoksa (DATABASE_URL tanımsız) db hatası döner, fn çağrılmaz", async () => {
    const fn = vi.fn();
    const r = await performWrite({ store: null, writers }, req, fn);
    expect(r).toMatchObject({ ok: false, error: { kind: "db" } });
    expect(fn).not.toHaveBeenCalled();
  });

  it("denetim insert'i patlarsa db hatası döner, fn çağrılmaz (fail closed)", async () => {
    const { store } = fakeStore({
      appendAudit: vi.fn(async () => {
        throw new Error("conn refused");
      }),
    });
    const fn = vi.fn();
    const r = await performWrite({ store, writers }, req, fn);
    expect(r).toMatchObject({ ok: false, error: { kind: "db" } });
    expect(fn).not.toHaveBeenCalled();
  });

  it("başarıda pending → ok yazar, auditId'yi fn'e verir", async () => {
    const { store, calls } = fakeStore();
    const fn = vi.fn(async (auditId: string) => ({ ok: true as const, value: { uuid: "b-1", auditId } }));
    const r = await performWrite({ store, writers }, req, fn);
    expect(r).toEqual({ ok: true, value: { uuid: "b-1", auditId: "audit-1" }, auditId: "audit-1" });
    expect(calls.append[0]).toMatchObject({ actorEmail: "ops@example.com", action: "backup.create", target: "db-1" });
    expect(calls.finish[0]).toMatchObject({ id: "audit-1", status: "ok", errorKind: null });
  });

  it("fn hatasında failed + error_kind yazar", async () => {
    const { store, calls } = fakeStore();
    const r = await performWrite({ store, writers }, req, async () => ({
      ok: false,
      error: { kind: "unreachable" as const, message: "Coolify'a ulaşılamadı" },
    }));
    expect(r).toMatchObject({ ok: false, error: { kind: "unreachable" }, auditId: "audit-1" });
    expect(calls.finish[0]).toMatchObject({ status: "failed", errorKind: "unreachable" });
  });

  it("fn throw ederse failed yazar ve hatayı sonuç olarak döner", async () => {
    const { store, calls } = fakeStore();
    const r = await performWrite({ store, writers }, req, async () => {
      throw new Error("beklenmedik");
    });
    expect(r).toMatchObject({ ok: false, error: { kind: "malformed" } });
    expect(calls.finish[0]).toMatchObject({ status: "failed", errorKind: "malformed" });
  });

  it("payload ve result redactJson'dan geçer", async () => {
    const { store, calls } = fakeStore();
    await performWrite(
      { store, writers },
      { ...req, payload: { secret: "x", frequency: "0 3 * * *" } },
      async () => ({
        ok: true,
        value: { token: "y" },
      }),
    );
    expect(calls.append[0]).toMatchObject({ payload: { secret: "***", frequency: "0 3 * * *" } });
    expect(calls.finish[0]).toMatchObject({ result: { token: "***" } });
  });

  it("finishAudit patlarsa yine de işlemin sonucunu döner (yazma gerçekleşti)", async () => {
    const { store } = fakeStore({
      finishAudit: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const r = await performWrite({ store, writers }, req, async () => ({ ok: true, value: 1 }));
    expect(r).toMatchObject({ ok: true, value: 1 });
  });
});
