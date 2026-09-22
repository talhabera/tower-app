import { describe, expect, it, vi } from "vitest";
import { createDashboardLoader, toDashboard, type DashboardData } from "./dashboard";
import { err, ok, parseStatus, type Fleet } from "@tower/coolify";

const fleet: Fleet = {
  servers: [{ uuid: "s1", name: "nexstep-1", reachable: true, usable: true }],
  projects: [],
  loadedAt: "2026-09-20T10:00:00.000Z",
};

describe("toDashboard", () => {
  it("401'de unauthorized durumuna düşer", () => {
    const d = toDashboard(err("unauthorized", "token reddedildi", 401), [], [], []);
    expect(d.state).toBe("unauthorized");
    expect(d.fleet).toBeNull();
    expect(d.stale).toBe(false);
  });

  it("ağ hatasında unreachable durumuna düşer", () => {
    const d = toDashboard(err("unreachable", "ulaşılamadı"), [], [], []);
    expect(d.state).toBe("unreachable");
    expect(d.stale).toBe(false);
  });

  it("başarıda risk raporu hesaplar", () => {
    const databases = [
      { uuid: "d1", name: "postgresql-nexauth", status: parseStatus("running:healthy"), backups: [] },
    ];
    const d = toDashboard(ok(fleet), databases, [], []);
    expect(d.state).toBe("ok");
    expect(d.risks?.unbackedDatabases.count).toBe(1);
    expect(d.loadedAt).toBe("2026-09-20T10:00:00.000Z");
    expect(d.stale).toBe(false);
  });
});

const okData: DashboardData = {
  state: "ok",
  fleet,
  risks: null,
  databases: [],
  storages: [],
  loadedAt: fleet.loadedAt,
  stale: false,
};

const errData: DashboardData = {
  state: "unreachable",
  fleet: null,
  risks: null,
  databases: [],
  storages: [],
  loadedAt: null,
  stale: false,
  message: "ulaşılamadı",
};

describe("createDashboardLoader", () => {
  it("taze: başarılı yüklemeyi olduğu gibi döner", async () => {
    const fetch = vi.fn(async () => okData);
    const load = createDashboardLoader(fetch, 10_000, () => 0);

    const result = await load();

    expect(result).toEqual(okData);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("bayat: TTL dolduktan sonra yükleme başarısız olursa son iyi veriyi stale:true ile döner", async () => {
    let now = 0;
    const clock = () => now;
    const fetch = vi.fn<() => Promise<DashboardData>>();
    fetch.mockResolvedValueOnce(okData).mockResolvedValueOnce(errData);
    const load = createDashboardLoader(fetch, 10_000, clock);

    const first = await load();
    expect(first.state).toBe("ok");
    expect(first.stale).toBe(false);

    now = 10_001; // TTL'i geçir, yeni bir ağ çağrısı tetiklenir
    const second = await load();

    expect(second.state).toBe("ok");
    expect(second.stale).toBe(true);
    expect(second.fleet).toEqual(okData.fleet);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("önceki iyi veri yoksa hatayı stale:false ile döner", async () => {
    const fetch = vi.fn(async () => errData);
    const load = createDashboardLoader(fetch, 10_000, () => 0);

    const result = await load();

    expect(result.state).toBe("unreachable");
    expect(result.stale).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("TTL içindeki tekrar çağrılar ağa gitmez", async () => {
    let now = 0;
    const clock = () => now;
    const fetch = vi.fn(async () => okData);
    const load = createDashboardLoader(fetch, 10_000, clock);

    await load();
    now = 5_000; // hâlâ TTL içinde
    const second = await load();

    expect(second).toEqual(okData);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
