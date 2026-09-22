import { describe, expect, it } from "vitest";
import environmentDetail from "./fixtures/environment-detail.json";
import servers from "./fixtures/servers.json";
import { getEnvironment, listServers } from "./api";
import type { CoolifyHttp } from "./http";
import { ok } from "./result";

function stubHttp(payload: unknown): CoolifyHttp {
  return { get: async <T>() => ok(payload as T) };
}

describe("listServers", () => {
  it("sunucuları erişilebilirlik bayraklarıyla eşler", async () => {
    const r = await listServers(stubHttp(servers));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBeGreaterThan(0);
    const s = r.value[0];
    expect(typeof s.uuid).toBe("string");
    expect(typeof s.name).toBe("string");
    expect(typeof s.reachable).toBe("boolean");
    expect(typeof s.usable).toBe("boolean");
  });
});

describe("getEnvironment", () => {
  it("tüm tür kovalarını tek kaynak listesine düzleştirir", async () => {
    const r = await getEnvironment(stubHttp(environmentDetail), "proj-uuid", "production");
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const kinds = new Set(r.value.resources.map((x) => x.kind));
    expect(kinds.has("application")).toBe(true);
    for (const res of r.value.resources) {
      expect(res.projectUuid).toBe("proj-uuid");
      expect(res.environmentName).toBe(r.value.name);
      expect(res.status.state).toBeDefined();
    }
  });

  it("boş kovalar için kaynak üretmez", async () => {
    const r = await getEnvironment(
      stubHttp({ uuid: "e1", name: "production", applications: [], postgresqls: [], mysqls: [] }),
      "p",
      "production",
    );
    if (r.ok) expect(r.value.resources).toEqual([]);
  });

  it("bilinmeyen kovaları yok sayar", async () => {
    const r = await getEnvironment(
      stubHttp({ uuid: "e1", name: "production", applications: [], gelecektekiTur: [{ uuid: "x" }] }),
      "p",
      "production",
    );
    if (r.ok) expect(r.value.resources).toEqual([]);
  });
});
