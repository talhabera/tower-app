import { describe, expect, it } from "vitest";
import type { CoolifyHttp } from "./http";
import { err, ok } from "./result";
import { loadFleet } from "./fleet";
import { mapPool } from "./pool";

function routedHttp(routes: Record<string, unknown>, failing: string[] = []): CoolifyHttp {
  return {
    get: async <T>(path: string) => {
      if (failing.includes(path)) return err<T>("unreachable", `düştü: ${path}`);
      const hit = routes[path];
      if (hit === undefined) return err<T>("not_found", path);
      return ok(hit as T);
    },
  };
}

const ROUTES = {
  "/servers": [{ uuid: "s1", name: "nexstep-1", settings: { is_reachable: true, is_usable: true } }],
  "/projects": [
    { uuid: "p1", name: "nexauth" },
    { uuid: "p2", name: "clientb" },
  ],
  "/projects/p1/environments": [{ uuid: "e1", name: "production" }],
  "/projects/p2/environments": [{ uuid: "e2", name: "production" }],
  "/projects/p1/production": {
    uuid: "e1",
    name: "production",
    applications: [{ uuid: "a1", name: "nexauth", status: "running:healthy" }],
    postgresqls: [{ uuid: "d1", name: "postgresql-nexauth", status: "running:healthy" }],
  },
  "/projects/p2/production": {
    uuid: "e2",
    name: "production",
    applications: [{ uuid: "a2", name: "clientb-web", status: "running:unknown" }],
  },
};

describe("mapPool", () => {
  it("eşzamanlılık sınırını aşmaz ve sınırı ulaştırır", async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapPool(items, 6, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active -= 1;
      return n;
    });

    expect(peak).toBe(6);
  });

  it("sırayı korur", async () => {
    const out = await mapPool([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40]);
  });

  it("boş input boş output döner", async () => {
    const out = await mapPool([], 6, async (n) => n);
    expect(out).toEqual([]);
  });

  it("limit > items.length için tüm öğeleri işler", async () => {
    const out = await mapPool([1, 2, 3], 10, async (n) => n * 2);
    expect(out).toEqual([2, 4, 6]);
  });
});

describe("loadFleet", () => {
  it("projeleri, environment'ları ve kaynakları toplar", async () => {
    const r = await loadFleet(routedHttp(ROUTES));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.servers).toHaveLength(1);
    expect(r.value.projects).toHaveLength(2);

    const nexauth = r.value.projects.find((p) => p.name === "nexauth");
    expect(nexauth?.environments[0].resources).toHaveLength(2);
    expect(nexauth?.environments[0].resources[0].projectName).toBe("nexauth");
    expect(typeof r.value.loadedAt).toBe("string");
  });

  it("tek projenin düşmesi ağacı çökertmez", async () => {
    const r = await loadFleet(routedHttp(ROUTES, ["/projects/p2/environments"]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.projects).toHaveLength(2);
    const clientb = r.value.projects.find((p) => p.name === "clientb");
    expect(clientb?.failure).toBeTruthy();
    expect(clientb?.environments).toEqual([]);

    const nexauth = r.value.projects.find((p) => p.name === "nexauth");
    expect(nexauth?.failure).toBeUndefined();
    expect(nexauth?.environments[0].resources.length).toBeGreaterThan(0);
  });

  it("ortam detayları alınamazsa hata kaydedilir", async () => {
    const r = await loadFleet(routedHttp(ROUTES, ["/projects/p1/production"]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const nexauth = r.value.projects.find((p) => p.name === "nexauth");
    expect(nexauth?.environments).toHaveLength(1);
    expect(nexauth?.environments[0].failure).toBeTruthy();
    expect(nexauth?.environments[0].resources).toEqual([]);
  });

  it("proje listesi alınamazsa hata döner", async () => {
    const r = await loadFleet(routedHttp(ROUTES, ["/projects"]));
    expect(r.ok).toBe(false);
  });

  it("sunucu listesi düşse bile projeler yüklenir", async () => {
    const r = await loadFleet(routedHttp(ROUTES, ["/servers"]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.servers).toEqual([]);
      expect(r.value.serversFailure).toBeTruthy();
      expect(r.value.projects).toHaveLength(2);
    }
  });

  it("sunucu listesi okunduğunda serversFailure boştur", async () => {
    const r = await loadFleet(routedHttp(ROUTES));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.serversFailure).toBeUndefined();
  });

  it("loadFleet toplam eşzamanlılık sınırını aşmaz", async () => {
    let active = 0;
    let peak = 0;
    let callCount = 0;

    function trackingHttp(routes: Record<string, unknown>, failing: string[] = []): CoolifyHttp {
      return {
        get: async <T>(path: string) => {
          if (failing.includes(path)) return err<T>("unreachable", `düştü: ${path}`);
          const hit = routes[path];
          if (hit === undefined) return err<T>("not_found", path);

          active += 1;
          callCount += 1;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 2));
          active -= 1;

          return ok(hit as T);
        },
      };
    }

    const manyProjectsRoutes: Record<string, unknown> = {
      "/servers": [],
      "/projects": Array.from({ length: 4 }, (_, i) => ({
        uuid: `p${i}`,
        name: `project-${i}`,
      })),
    };

    for (let i = 0; i < 4; i++) {
      manyProjectsRoutes[`/projects/p${i}/environments`] = Array.from({ length: 3 }, (_, j) => ({
        uuid: `e${i}-${j}`,
        name: `env-${j}`,
      }));
      for (let j = 0; j < 3; j++) {
        manyProjectsRoutes[`/projects/p${i}/env-${j}`] = {
          uuid: `e${i}-${j}`,
          name: `env-${j}`,
          applications: [],
          postgresqls: [],
        };
      }
    }

    const r = await loadFleet(trackingHttp(manyProjectsRoutes));
    expect(r.ok).toBe(true);
    expect(peak).toBeLessThanOrEqual(6);
    expect(callCount).toBeGreaterThan(0);
  });
});
