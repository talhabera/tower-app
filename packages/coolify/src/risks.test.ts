import { describe, expect, it } from "vitest";
import { computeRisks } from "./risks";
import { parseStatus } from "./status";
import type { ApplicationDetail, DatabaseSummary, FleetProject } from "./types";
import type { Fleet } from "./fleet";

const project = (resources: FleetProject["environments"][number]["resources"]): FleetProject => ({
  uuid: "p1",
  name: "nexauth",
  environments: [{ uuid: "e1", name: "production", resources }],
});

const fleet = (overrides: Partial<Fleet> = {}): Fleet => ({
  servers: [{ uuid: "s1", name: "nexstep-1", reachable: true, usable: true }],
  projects: [],
  loadedAt: "2026-09-20T00:00:00.000Z",
  ...overrides,
});

const app = (over: Partial<ApplicationDetail> = {}): ApplicationDetail => ({
  uuid: "a1",
  name: "nexauth",
  description: "",
  buildPack: "dockerfile",
  gitRepository: "talhabera/nexauth",
  gitBranch: "main",
  domains: [],
  portsExposed: "5050",
  healthCheckEnabled: false,
  healthCheckPath: "/",
  limitsMemory: "0",
  limitsCpus: "0",
  status: parseStatus("running:unknown"),
  ...over,
});

describe("computeRisks", () => {
  it("yedek programı olmayan veritabanlarını sayar", () => {
    const databases: DatabaseSummary[] = [
      { uuid: "d1", name: "postgresql-nexauth", status: parseStatus("running:healthy"), backups: [] },
      {
        uuid: "d2",
        name: "postgresql-clientb",
        status: parseStatus("running:healthy"),
        backups: [{ uuid: "b1", enabled: true, frequency: "0 2 * * *", saveToS3: true }],
      },
    ];

    const r = computeRisks({ fleet: fleet(), databases, applications: [] });
    expect(r.unbackedDatabases.count).toBe(1);
    expect(r.unbackedDatabases.items[0].name).toBe("postgresql-nexauth");
  });

  it("devre dışı yedek programını yedeksiz sayar", () => {
    const databases: DatabaseSummary[] = [
      {
        uuid: "d1",
        name: "postgres-trader",
        status: parseStatus("running:healthy"),
        backups: [{ uuid: "b1", enabled: false, frequency: "0 2 * * *", saveToS3: true }],
      },
    ];
    expect(computeRisks({ fleet: fleet(), databases, applications: [] }).unbackedDatabases.count).toBe(1);
  });

  it("healthcheck'i kapalı uygulamaları sayar", () => {
    const applications = [app({ healthCheckEnabled: false }), app({ uuid: "a2", healthCheckEnabled: true })];
    const r = computeRisks({ fleet: fleet(), databases: [], applications });
    expect(r.healthcheckDisabledApps.count).toBe(1);
    expect(r.healthcheckDisabledApps.items[0].uuid).toBe("a1");
  });

  it("çalışmayan kaynakları sayar", () => {
    const f = fleet({
      projects: [
        project([
          { uuid: "r1", name: "relay-web", kind: "application", status: parseStatus("exited:unhealthy"), projectUuid: "p1", projectName: "nexauth", environmentName: "production" },
          { uuid: "r2", name: "nexauth", kind: "application", status: parseStatus("running:healthy"), projectUuid: "p1", projectName: "nexauth", environmentName: "production" },
        ]),
      ],
    });

    const r = computeRisks({ fleet: f, databases: [], applications: [] });
    expect(r.downResources.count).toBe(1);
    expect(r.downResources.items[0].name).toBe("relay-web");
  });

  it("running:unknown'ı düşmüş SAYMAZ", () => {
    const f = fleet({
      projects: [
        project([
          { uuid: "r1", name: "trader-web", kind: "application", status: parseStatus("running:unknown"), projectUuid: "p1", projectName: "nexauth", environmentName: "production" },
        ]),
      ],
    });
    expect(computeRisks({ fleet: f, databases: [], applications: [] }).downResources.count).toBe(0);
  });

  it("running:unhealthy kaynağı düşmüş sayar", () => {
    const f = fleet({
      projects: [
        project([
          { uuid: "r1", name: "relay-web", kind: "application", status: parseStatus("running:unhealthy"), projectUuid: "p1", projectName: "nexstep-relay", environmentName: "production" },
        ]),
      ],
    });
    expect(computeRisks({ fleet: f, databases: [], applications: [] }).downResources.items).toEqual([
      { uuid: "r1", name: "relay-web" },
    ]);
  });

  it("erişilemeyen veya kullanılamaz sunucuları sayar", () => {
    const f = fleet({
      servers: [
        { uuid: "s1", name: "nexstep-1", reachable: true, usable: true },
        { uuid: "s2", name: "bera-cloud-1", reachable: false, usable: true },
        { uuid: "s3", name: "trader-1", reachable: true, usable: false },
      ],
    });
    expect(computeRisks({ fleet: f, databases: [], applications: [] }).unreachableServers.count).toBe(2);
  });

  it("her şey yolundayken tüm sayaçlar sıfırdır", () => {
    const r = computeRisks({ fleet: fleet(), databases: [], applications: [] });
    expect(r.unbackedDatabases.count).toBe(0);
    expect(r.healthcheckDisabledApps.count).toBe(0);
    expect(r.downResources.count).toBe(0);
    expect(r.unreachableServers.count).toBe(0);
  });
});
