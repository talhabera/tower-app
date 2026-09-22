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
  it("eşzamanlılık sınırını aşmaz", async () => {
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

    expect(peak).toBeLessThanOrEqual(6);
  });

  it("sırayı korur", async () => {
    const out = await mapPool([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40]);
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

  it("proje listesi alınamazsa hata döner", async () => {
    const r = await loadFleet(routedHttp(ROUTES, ["/projects"]));
    expect(r.ok).toBe(false);
  });

  it("sunucu listesi düşse bile projeler yüklenir", async () => {
    const r = await loadFleet(routedHttp(ROUTES, ["/servers"]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.servers).toEqual([]);
      expect(r.value.projects).toHaveLength(2);
    }
  });
});
