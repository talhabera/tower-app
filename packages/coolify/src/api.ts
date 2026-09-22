import type { CoolifyHttp } from "./http";
import { ok, type Result } from "./result";
import { parseStatus } from "./status";
import {
  RESOURCE_BUCKETS,
  type ApplicationDetail,
  type DatabaseBackup,
  type DatabaseSummary,
  type DeploymentSummary,
  type FleetEnvironment,
  type FleetResource,
  type FleetServer,
  type S3Storage,
} from "./types";

type Raw = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const bool = (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : fallback);
const rows = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);

function map<T>(result: Result<unknown>, fn: (rows: Raw[]) => T[]): Result<T[]> {
  if (!result.ok) return result;
  return ok(fn(rows(result.value)));
}

export async function listServers(http: CoolifyHttp): Promise<Result<FleetServer[]>> {
  const r = await http.get<unknown>("/servers");
  return map(r, (list) =>
    list.map((s) => {
      const settings = (s.settings ?? {}) as Raw;
      return {
        uuid: str(s.uuid),
        name: str(s.name),
        reachable: bool(settings.is_reachable),
        usable: bool(settings.is_usable),
      };
    }),
  );
}

export async function listProjects(
  http: CoolifyHttp,
): Promise<Result<Array<{ uuid: string; name: string }>>> {
  const r = await http.get<unknown>("/projects");
  return map(r, (list) => list.map((p) => ({ uuid: str(p.uuid), name: str(p.name) })));
}

export async function listEnvironments(
  http: CoolifyHttp,
  projectUuid: string,
): Promise<Result<Array<{ uuid: string; name: string }>>> {
  const r = await http.get<unknown>(`/projects/${projectUuid}/environments`);
  return map(r, (list) => list.map((e) => ({ uuid: str(e.uuid), name: str(e.name) })));
}

export async function getEnvironment(
  http: CoolifyHttp,
  projectUuid: string,
  environmentName: string,
  projectName = "",
): Promise<Result<FleetEnvironment>> {
  const r = await http.get<Raw>(`/projects/${projectUuid}/${environmentName}`);
  if (!r.ok) return r;

  const detail = r.value;
  const name = str(detail.name, environmentName);
  const resources: FleetResource[] = [];

  for (const [bucket, kind] of Object.entries(RESOURCE_BUCKETS)) {
    for (const item of rows(detail[bucket])) {
      resources.push({
        uuid: str(item.uuid),
        name: str(item.name),
        kind,
        status: parseStatus(str(item.status)),
        projectUuid,
        projectName,
        environmentName: name,
      });
    }
  }

  return ok({ uuid: str(detail.uuid), name, resources });
}

export async function listDatabases(http: CoolifyHttp): Promise<Result<DatabaseSummary[]>> {
  const r = await http.get<unknown>("/databases");
  return map(r, (list) =>
    list.map((d) => ({
      uuid: str(d.uuid),
      name: str(d.name),
      status: parseStatus(str(d.status)),
      backups: [],
    })),
  );
}

export async function getDatabaseBackups(
  http: CoolifyHttp,
  databaseUuid: string,
): Promise<Result<DatabaseBackup[]>> {
  const r = await http.get<unknown>(`/databases/${databaseUuid}/backups`);
  return map(r, (list) =>
    list.map((b) => ({
      uuid: str(b.uuid),
      enabled: bool(b.enabled),
      frequency: str(b.frequency),
      saveToS3: bool(b.save_s3),
    })),
  );
}

export async function listS3Storages(http: CoolifyHttp): Promise<Result<S3Storage[]>> {
  const r = await http.get<unknown>("/s3-storages");
  return map(r, (list) =>
    list.map((s) => ({
      uuid: str(s.uuid),
      name: str(s.name),
      bucket: str(s.bucket),
      endpoint: str(s.endpoint),
      usable: bool(s.is_usable),
    })),
  );
}

export async function getApplication(
  http: CoolifyHttp,
  uuid: string,
): Promise<Result<ApplicationDetail>> {
  const r = await http.get<Raw>(`/applications/${uuid}`);
  if (!r.ok) return r;
  const a = r.value;

  return ok({
    uuid: str(a.uuid),
    name: str(a.name),
    description: str(a.description),
    buildPack: str(a.build_pack),
    gitRepository: str(a.git_repository),
    gitBranch: str(a.git_branch),
    domains: str(a.fqdn)
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean),
    portsExposed: str(a.ports_exposes),
    healthCheckEnabled: bool(a.health_check_enabled),
    healthCheckPath: str(a.health_check_path),
    limitsMemory: str(a.limits_memory, "0"),
    limitsCpus: str(a.limits_cpus, "0"),
    status: parseStatus(str(a.status)),
  });
}

export async function listDeployments(http: CoolifyHttp): Promise<Result<DeploymentSummary[]>> {
  const r = await http.get<unknown>("/deployments");
  return map(r, (list) =>
    list.map((d) => ({
      uuid: str(d.deployment_uuid, str(d.uuid)),
      applicationName: str(d.application_name),
      status: str(d.status),
      createdAt: str(d.created_at),
    })),
  );
}
