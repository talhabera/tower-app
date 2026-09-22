import { describe, expect, it, vi } from "vitest";
import {
  createDashboardLoader,
  errorDashboard,
  riskCounts,
  toDashboard,
  type DashboardData,
  type DashboardSources,
} from "./dashboard";
import { err, ok, parseStatus, type ApplicationDetail, type Fleet } from "@tower/coolify";

const fleet: Fleet = {
  servers: [{ uuid: "s1", name: "nexstep-1", reachable: true, usable: true }],
  projects: [],
  loadedAt: "2026-09-20T10:00:00.000Z",
};

const emptySources: DashboardSources = {
  databases: ok([]),
  applications: [],
  storages: ok([]),
};

const app = (uuid: string, healthCheckEnabled: boolean): ApplicationDetail => ({
  uuid,
  name: uuid,
  description: "",
  buildPack: "",
  gitRepository: "",
  gitBranch: "",
  domains: [],
  portsExposed: "",
  healthCheckEnabled,
  healthCheckPath: "",
  limitsMemory: "0",
  limitsCpus: "0",
  status: parseStatus("running:healthy"),
});

describe("toDashboard", () => {
  it("401'de unauthorized durumuna düşer", () => {
    const d = toDashboard(err("unauthorized", "token reddedildi", 401), emptySources);
    expect(d.state).toBe("unauthorized");
    expect(d.fleet).toBeNull();
    expect(d.stale).toBe(false);
  });

  it("ağ hatasında unreachable durumuna düşer", () => {
    const d = toDashboard(err("unreachable", "ulaşılamadı"), emptySources);
    expect(d.state).toBe("unreachable");
    expect(d.stale).toBe(false);
  });

  it("başarıda risk raporu hesaplar", () => {
    const databases = [
      { uuid: "d1", name: "postgresql-nexauth", status: parseStatus("running:healthy"), backups: [] },
    ];
    const d = toDashboard(ok(fleet), { ...emptySources, databases: ok(databases) });
    expect(d.state).toBe("ok");
    expect(d.risks?.unbackedDatabases.count).toBe(1);
    expect(d.loadedAt).toBe("2026-09-20T10:00:00.000Z");
    expect(d.stale).toBe(false);
    expect(riskCounts(d.risks!, d.failures).unbackedDatabases).toBe(1);
  });

  it("veritabanı listesi okunamazsa yedeksiz sayacı 0 değil bilinmiyor olur", () => {
    const d = toDashboard(ok(fleet), { ...emptySources, databases: err("unreachable", "db okunamadı") });
    expect(d.state).toBe("ok");
    expect(d.failures.databases).toBe("db okunamadı");
    expect(riskCounts(d.risks!, d.failures).unbackedDatabases).toBeNull();
  });

  it("bir veritabanının yedekleri okunamazsa sayaç bilinmiyor olur ve o db yedeksiz sayılmaz", () => {
    const databases = [
      {
        uuid: "d1",
        name: "pg",
        status: parseStatus("running:healthy"),
        backups: [],
        backupsFailure: "okunamadı",
      },
    ];
    const d = toDashboard(ok(fleet), { ...emptySources, databases: ok(databases) });
    expect(d.failures.backups).toEqual(["d1"]);
    expect(d.risks?.unbackedDatabases.count).toBe(0);
    expect(riskCounts(d.risks!, d.failures).unbackedDatabases).toBeNull();
  });

  it("bir uygulama detayı okunamazsa healthcheck sayacı bilinmiyor olur", () => {
    const d = toDashboard(ok(fleet), {
      ...emptySources,
      applications: [ok(app("a1", false)), err("unreachable", "a2 okunamadı")],
    });
    expect(d.risks?.healthcheckDisabledApps.count).toBe(1);
    expect(d.failures.applications).toEqual(["a2 okunamadı"]);
    expect(riskCounts(d.risks!, d.failures).healthcheckDisabledApps).toBeNull();
  });

  it("sunucu listesi okunamazsa sorunlu sunucu sayacı bilinmiyor olur", () => {
    const d = toDashboard(ok({ ...fleet, servers: [], serversFailure: "sunucular okunamadı" }), emptySources);
    expect(d.failures.servers).toBe("sunucular okunamadı");
    expect(riskCounts(d.risks!, d.failures).unreachableServers).toBeNull();
  });

  it("S3 listesi okunamazsa hata kaydedilir (boş liste 'S3 yok' anlamına gelmez)", () => {
    const d = toDashboard(ok(fleet), { ...emptySources, storages: err("unreachable", "s3 okunamadı") });
    expect(d.failures.storages).toBe("s3 okunamadı");
    expect(d.storages).toEqual([]);
  });

  it("hiçbir kaynak düşmediyse tüm sayaçlar sayıdır", () => {
    const d = toDashboard(ok(fleet), emptySources);
    expect(riskCounts(d.risks!, d.failures)).toEqual({
      unbackedDatabases: 0,
      healthcheckDisabledApps: 0,
      downResources: 0,
      unreachableServers: 0,
    });
  });
});

const okData: DashboardData = {
  state: "ok",
  fleet,
  risks: null,
  databases: [],
  storages: [],
  failures: { applications: [], backups: [] },
  loadedAt: fleet.loadedAt,
  stale: false,
};

const errData: DashboardData = errorDashboard("unreachable", "ulaşılamadı");
const unauthorizedData: DashboardData = errorDashboard("unauthorized", "Coolify token'ı reddedildi");

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

  it("önceki iyi veri yoksa hatayı mesajıyla ve stale:false ile döner", async () => {
    const fetch = vi.fn(async () => errData);
    const load = createDashboardLoader(fetch, 10_000, () => 0);

    const result = await load();

    expect(result.state).toBe("unreachable");
    expect(result.message).toBe("ulaşılamadı");
    expect(result.stale).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("401 bayat veriyle örtülmez: elde iyi veri olsa da unauthorized döner", async () => {
    let now = 0;
    const fetch = vi.fn<() => Promise<DashboardData>>();
    fetch.mockResolvedValueOnce(okData).mockResolvedValueOnce(unauthorizedData);
    const load = createDashboardLoader(fetch, 10_000, () => now);

    await load();
    now = 10_001;
    const second = await load();

    expect(second.state).toBe("unauthorized");
    expect(second.message).toBe("Coolify token'ı reddedildi");
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

  it("eşzamanlı çağrılar tek bir fetch'i paylaşır", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetch = vi.fn(async () => {
      await gate;
      return okData;
    });
    const load = createDashboardLoader(fetch, 10_000, () => 0);

    const a = load();
    const b = load();
    release();
    const [ra, rb] = await Promise.all([a, b]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ra).toBe(rb);
  });

  it("uçuş bittikten ve TTL dolduktan sonra yeni fetch yapılır", async () => {
    let now = 0;
    const fetch = vi.fn(async () => okData);
    const load = createDashboardLoader(fetch, 10_000, () => now);

    await load();
    now = 10_001;
    await load();

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("invalidate() TTL içindeki memo'yu boşaltır, sonraki çağrı ağa gider", async () => {
    let now = 0;
    const fetch = vi.fn(async () => okData);
    const load = createDashboardLoader(fetch, 10_000, () => now);
    await load();
    now = 1_000;
    load.invalidate();
    await load();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
