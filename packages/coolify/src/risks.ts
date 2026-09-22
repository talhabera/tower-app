import type { Fleet } from "./fleet";
import type { ApplicationDetail, DatabaseSummary } from "./types";

export type RiskItem = { uuid: string; name: string };
export type RiskBucket = { count: number; items: RiskItem[] };

export type RiskReport = {
  unbackedDatabases: RiskBucket;
  healthcheckDisabledApps: RiskBucket;
  downResources: RiskBucket;
  unreachableServers: RiskBucket;
};

export type RiskInput = {
  fleet: Fleet;
  databases: DatabaseSummary[];
  applications: ApplicationDetail[];
};

const bucket = (items: RiskItem[]): RiskBucket => ({ count: items.length, items });

export function computeRisks({ fleet, databases, applications }: RiskInput): RiskReport {
  const unbacked = databases
    .filter((d) => !d.backups.some((b) => b.enabled))
    .map((d) => ({ uuid: d.uuid, name: d.name }));

  const noHealthcheck = applications
    .filter((a) => !a.healthCheckEnabled)
    .map((a) => ({ uuid: a.uuid, name: a.name }));

  const down = fleet.projects
    .flatMap((p) => p.environments)
    .flatMap((e) => e.resources)
    // Düşmüş: çalışmıyor (exited vb.) ya da çalışıyor ama healthcheck unhealthy diyor.
    // running:unknown healthcheck eksikliğidir, düşmüş değildir — ayrı sayaçta izlenir.
    // state "unknown" parse edilemeyen durumdur; düşmüş sayılmaz.
    .filter(
      (r) =>
        (r.status.state !== "running" && r.status.state !== "unknown") ||
        r.status.health === "unhealthy",
    )
    .map((r) => ({ uuid: r.uuid, name: r.name }));

  const servers = fleet.servers
    .filter((s) => !s.reachable || !s.usable)
    .map((s) => ({ uuid: s.uuid, name: s.name }));

  return {
    unbackedDatabases: bucket(unbacked),
    healthcheckDisabledApps: bucket(noHealthcheck),
    downResources: bucket(down),
    unreachableServers: bucket(servers),
  };
}
