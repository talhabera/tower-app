import type { CoolifyHttp } from "./http";
import { maskSecrets } from "./mask";
import { err, ok, type Result } from "./result";
import { parseStatus } from "./status";
import {
  RESOURCE_BUCKETS,
  type ApplicationDetail,
  type ApplicationStorage,
  type DatabaseBackup,
  type DatabaseSummary,
  type DeploymentSummary,
  type EnvKey,
  type FleetEnvironment,
  type FleetResource,
  type FleetServer,
  type S3Storage,
  type ScheduledTask,
} from "./types";

type Raw = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const bool = (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : fallback);
const rows = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);

/**
 * Coolify bazı liste uçlarını doğrudan dizi, bazılarını bir sarmal nesne
 * içinde (ör. `{ data: [...] }`, `{ deployments: [...] }`) döner.
 * `envelopeKeys` sırayla denenir; ilk dizi bulunan anahtar kullanılır.
 */
function extractRows(v: unknown, envelopeKeys: string[] = ["data"]): Raw[] {
  if (Array.isArray(v)) return v.filter((x): x is Raw => x != null && typeof x === "object");
  if (v != null && typeof v === "object") {
    for (const key of envelopeKeys) {
      const inner = (v as Raw)[key];
      if (Array.isArray(inner)) {
        return inner.filter((x): x is Raw => x != null && typeof x === "object");
      }
    }
  }
  return [];
}

function map<T>(result: Result<unknown>, fn: (rows: Raw[]) => T[]): Result<T[]> {
  if (!result.ok) return result;
  return ok(fn(rows(result.value)));
}

const UUID_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * `uuid` bir Coolify kimliği biçimine uyuyor mu diye doğrular ve uyuyorsa
 * URL'e güvenle gömülebilecek kodlanmış hâlini döner. Uymuyorsa AĞA HİÇ
 * GİTMEDEN hata döner — path/query enjeksiyonunu (ör. `../../v2/servers`,
 * `abc?x=1`) engeller. Kullanıcı denetimli her `uuid` path parçası bu
 * fonksiyondan geçmeden `http.get`'e verilmemelidir.
 */
function seg(uuid: string): Result<string> {
  if (!UUID_SEGMENT.test(uuid)) {
    return err("not_found", "Geçersiz kaynak tanımlayıcı");
  }
  return ok(encodeURIComponent(uuid));
}

export async function listServers(http: CoolifyHttp): Promise<Result<FleetServer[]>> {
  const r = await http.get<unknown>("/servers");
  return map(r, (list) =>
    list
      .filter((s): s is Raw => s != null && typeof s === "object")
      .map((s) => {
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
  return map(r, (list) =>
    list
      .filter((p): p is Raw => p != null && typeof p === "object")
      .map((p) => ({ uuid: str(p.uuid), name: str(p.name) })),
  );
}

export async function listEnvironments(
  http: CoolifyHttp,
  projectUuid: string,
): Promise<Result<Array<{ uuid: string; name: string }>>> {
  const r = await http.get<unknown>(`/projects/${projectUuid}/environments`);
  return map(r, (list) =>
    list
      .filter((e): e is Raw => e != null && typeof e === "object")
      .map((e) => ({ uuid: str(e.uuid), name: str(e.name) })),
  );
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
    list
      .filter((d): d is Raw => d != null && typeof d === "object")
      .map((d) => ({
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
    list
      .filter((b): b is Raw => b != null && typeof b === "object")
      .map((b) => ({
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
    list
      .filter((s): s is Raw => s != null && typeof s === "object")
      .map((s) => ({
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
  const path = seg(uuid);
  if (!path.ok) return path;
  const r = await http.get<Raw>(`/applications/${path.value}`);
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
    list
      .filter((d): d is Raw => d != null && typeof d === "object")
      .map((d) => ({
        uuid: str(d.deployment_uuid, str(d.uuid)),
        applicationName: str(d.application_name),
        status: str(d.status),
        createdAt: str(d.created_at),
      })),
  );
}

/**
 * Uygulamanın ortam değişkeni anahtarlarını döner. `value` alanı bilerek okunmaz
 * ve dönüş nesnesine hiçbir şekilde eklenmez — sır değeri paket sınırını asla geçmez.
 */
export async function listApplicationEnvKeys(
  http: CoolifyHttp,
  uuid: string,
): Promise<Result<EnvKey[]>> {
  const path = seg(uuid);
  if (!path.ok) return path;
  const r = await http.get<unknown>(`/applications/${path.value}/envs`);
  // NOT: gelen öğeler `value` VE `real_value` alanlarını taşıyabilir — ikisi de
  // bilerek okunmaz. Aşağıdaki map yalnızca key/isBuildTime/isPreview üretir;
  // sır değeri paket sınırını asla geçmez.
  return map(r, (list) =>
    list
      .filter((e): e is Raw => e != null && typeof e === "object")
      .map((e) => ({
        key: str(e.key),
        isBuildTime: bool(e.is_build_time),
        isPreview: bool(e.is_preview),
      })),
  );
}

function mapStorageItem(s: Raw): ApplicationStorage {
  return {
    uuid: str(s.uuid),
    name: str(s.name, str(s.fs_path)),
    mountPath: str(s.mount_path, str(s.fs_path)),
  };
}

/**
 * Coolify bu uçta dizi değil, `{ persistent_storages: [...], file_storages: [...] }`
 * biçiminde bir nesne döner; ikisi birden tek listeye toplanır. Düz dizi
 * yanıtı da (ör. eski sürümler) geriye dönük uyumluluk için desteklenir.
 */
export async function listApplicationStorages(
  http: CoolifyHttp,
  uuid: string,
): Promise<Result<ApplicationStorage[]>> {
  const path = seg(uuid);
  if (!path.ok) return path;
  const r = await http.get<unknown>(`/applications/${path.value}/storages`);
  if (!r.ok) return r;

  const value = r.value;
  const items = Array.isArray(value)
    ? extractRows(value)
    : [
        ...extractRows((value as Raw)?.persistent_storages),
        ...extractRows((value as Raw)?.file_storages),
      ];

  return ok(items.map(mapStorageItem));
}

export async function listApplicationScheduledTasks(
  http: CoolifyHttp,
  uuid: string,
): Promise<Result<ScheduledTask[]>> {
  const path = seg(uuid);
  if (!path.ok) return path;
  const r = await http.get<unknown>(`/applications/${path.value}/scheduled-tasks`);
  return map(r, (list) =>
    list
      .filter((t): t is Raw => t != null && typeof t === "object")
      .map((t) => ({
        uuid: str(t.uuid),
        name: str(t.name),
        frequency: str(t.frequency),
        enabled: bool(t.enabled),
      })),
  );
}

/** Uygulamanın son N dağıtımı, en yeni önce. */
export async function listApplicationDeployments(
  http: CoolifyHttp,
  uuid: string,
  limit = 10,
): Promise<Result<DeploymentSummary[]>> {
  const path = seg(uuid);
  if (!path.ok) return path;
  const r = await http.get<unknown>(`/deployments/applications/${path.value}?skip=0&take=${limit}`);
  if (!r.ok) return r;
  // Gerçek yanıt `{ count, deployments: [...] }` sarmalıdır; düz dizi ve
  // `{ data: [...] }` da geriye dönük uyumluluk için desteklenir.
  // Öğeler `logs` alanı taşıyabilir (HASSAS) — bilerek buraya kopyalanmaz.
  const list = extractRows(r.value, ["deployments", "data"])
    .map((d) => ({
      uuid: str(d.deployment_uuid, str(d.uuid)),
      applicationName: str(d.application_name),
      status: str(d.status),
      createdAt: str(d.created_at),
    }))
    .slice(0, limit);
  return ok(list);
}

/**
 * Uygulamanın son log satırları. Her satır paket sınırını geçmeden önce
 * maskSecrets'tan geçirilir — çağıran taraf ham log içeriğini asla görmez.
 */
export async function getApplicationLogs(
  http: CoolifyHttp,
  uuid: string,
  lines = 100,
): Promise<Result<string[]>> {
  const path = seg(uuid);
  if (!path.ok) return path;
  const r = await http.get<unknown>(`/applications/${path.value}/logs?lines=${lines}`);
  if (!r.ok) return r;

  const value = r.value;
  let rawLines: string[];
  if (Array.isArray(value)) {
    rawLines = value.filter((v): v is string => typeof v === "string");
  } else if (value != null && typeof value === "object" && typeof (value as Raw).logs === "string") {
    rawLines = ((value as Raw).logs as string).split("\n");
  } else {
    rawLines = [];
  }

  return ok(rawLines.map((line) => maskSecrets(line)));
}
