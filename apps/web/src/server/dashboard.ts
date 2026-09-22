import "server-only";
import {
  computeRisks,
  getApplication,
  getDatabaseBackups,
  isOk,
  listDatabases,
  listS3Storages,
  loadFleet,
  mapPool,
  type ApplicationDetail,
  type DatabaseSummary,
  type Fleet,
  type Result,
  type RiskReport,
  type S3Storage,
} from "@tower/coolify";
import { getCoolify } from "./coolify";

/** Sayfaların ortak "ulaşılamadı" metni. */
export const UNREACHABLE_MESSAGE = "Coolify'a ulaşılamadı.";

/** Yedek listesi okunamadıysa `backupsFailure` dolu gelir; `backups: []` o zaman "yedek yok" DEĞİLDİR. */
export type DashboardDatabase = DatabaseSummary & { backupsFailure?: string };

/**
 * Kaynak bazında okuma hataları. Bir kaynak okunamadıysa ona bağlı sayaç
 * 0 değil "bilinmiyor" gösterilmelidir (sessiz "her şey yolunda" yok).
 */
export type DashboardFailures = {
  databases?: string;
  servers?: string;
  storages?: string;
  /** Detayı okunamayan uygulamaların hata mesajları. */
  applications: string[];
  /** Yedek listesi okunamayan veritabanlarının uuid'leri. */
  backups: string[];
};

export type DashboardData = {
  state: "ok" | "unauthorized" | "unreachable";
  fleet: Fleet | null;
  risks: RiskReport | null;
  databases: DashboardDatabase[];
  storages: S3Storage[];
  failures: DashboardFailures;
  loadedAt: string | null;
  /** Yükleme başarısız olduğunda, elde bir önceki iyi veri varsa true olur. */
  stale: boolean;
  message?: string;
};

const noFailures = (): DashboardFailures => ({ applications: [], backups: [] });

export function errorDashboard(
  state: "unauthorized" | "unreachable",
  message: string = UNREACHABLE_MESSAGE,
): DashboardData {
  return {
    state,
    fleet: null,
    risks: null,
    databases: [],
    storages: [],
    failures: noFailures(),
    loadedAt: null,
    stale: false,
    message,
  };
}

export type DashboardSources = {
  databases: Result<DashboardDatabase[]>;
  applications: Result<ApplicationDetail>[];
  storages: Result<S3Storage[]>;
};

/** Saf dönüşüm — test edilebilir olsun diye ağ çağrısından ayrıldı. */
export function toDashboard(fleetResult: Result<Fleet>, sources: DashboardSources): DashboardData {
  if (!isOk(fleetResult)) {
    return errorDashboard(
      fleetResult.error.kind === "unauthorized" ? "unauthorized" : "unreachable",
      fleetResult.error.message,
    );
  }

  const fleet = fleetResult.value;
  const databases = isOk(sources.databases) ? sources.databases.value : [];
  const applications: ApplicationDetail[] = [];
  const failures = noFailures();

  if (!isOk(sources.databases)) failures.databases = sources.databases.error.message;
  if (!isOk(sources.storages)) failures.storages = sources.storages.error.message;
  if (fleet.serversFailure) failures.servers = fleet.serversFailure;
  for (const r of sources.applications) {
    if (isOk(r)) applications.push(r.value);
    else failures.applications.push(r.error.message);
  }
  for (const db of databases) {
    if (db.backupsFailure) failures.backups.push(db.uuid);
  }

  return {
    state: "ok",
    fleet,
    risks: computeRisks({
      fleet,
      // Yedeği okunamayan veritabanı "yedeksiz" sayılmaz; sayaç zaten "?" gösterir.
      databases: databases.filter((d) => !d.backupsFailure),
      applications,
    }),
    databases,
    storages: isOk(sources.storages) ? sources.storages.value : [],
    failures,
    loadedAt: fleet.loadedAt,
    stale: false,
  };
}

export type RiskCounts = {
  unbackedDatabases: number | null;
  healthcheckDisabledApps: number | null;
  downResources: number;
  unreachableServers: number | null;
};

/** Sayaç değerleri. `null` = kaynağı okunamadı, sayaç "?" gösterir (asla 0 değil). */
export function riskCounts(risks: RiskReport, failures: DashboardFailures): RiskCounts {
  return {
    unbackedDatabases:
      failures.databases || failures.backups.length > 0 ? null : risks.unbackedDatabases.count,
    healthcheckDisabledApps:
      failures.applications.length > 0 ? null : risks.healthcheckDisabledApps.count,
    downResources: risks.downResources.count,
    unreachableServers: failures.servers ? null : risks.unreachableServers.count,
  };
}

async function fetchDashboardData(): Promise<DashboardData> {
  const http = getCoolify();
  if (!isOk(http)) return errorDashboard("unreachable", http.error.message);

  const fleetResult = await loadFleet(http.value);
  // Filo okunamadıysa diğer kaynaklara hiç gidilmez (401'de boşuna 50 çağrı yapılmaz).
  if (!isOk(fleetResult)) {
    return toDashboard(fleetResult, {
      databases: { ok: true, value: [] },
      applications: [],
      storages: { ok: true, value: [] },
    });
  }

  const dbList = await listDatabases(http.value);
  const databases: Result<DashboardDatabase[]> = isOk(dbList)
    ? {
        ok: true,
        value: await mapPool(dbList.value, 6, async (db): Promise<DashboardDatabase> => {
          const backups = await getDatabaseBackups(http.value, db.uuid);
          return isOk(backups)
            ? { ...db, backups: backups.value }
            : { ...db, backups: [], backupsFailure: backups.error.message };
        }),
      }
    : dbList;

  const appUuids = fleetResult.value.projects
    .flatMap((p) => p.environments)
    .flatMap((e) => e.resources)
    .filter((r) => r.kind === "application")
    .map((r) => r.uuid);

  const applications = await mapPool(appUuids, 6, async (uuid) => getApplication(http.value, uuid));
  const storages = await listS3Storages(http.value);

  return toDashboard(fleetResult, { databases, applications, storages });
}

export type DashboardFetcher = () => Promise<DashboardData>;
export type Clock = () => number;

const DASHBOARD_TTL_MS = 10_000;

/**
 * `fetch`'i process-level bir bellekle (10 sn TTL) sarar.
 * - TTL içinde tekrar çağrılırsa son sonucu döner (ağa gitmez).
 * - Aynı anda gelen çağrılar tek bir uçuştaki `fetch`'i paylaşır.
 * - TTL dolduğunda ağa gider; başarısız olursa ve elde bir önceki başarılı
 *   veri varsa onu `stale: true` ile döner. Önceki iyi veri yoksa hatayı döner.
 * - İSTİSNA: 401 (unauthorized) asla bayat veriyle örtülmez — token geçersizse
 *   sayfalar token bandını göstermelidir.
 * Test edilebilirlik için saat dışarıdan verilebilir.
 */
export type DashboardLoader = DashboardFetcher & { invalidate(): void };

export function createDashboardLoader(
  fetch: DashboardFetcher,
  ttlMs: number = DASHBOARD_TTL_MS,
  clock: Clock = () => Date.now(),
): DashboardLoader {
  let goodCache: { data: DashboardData; fetchedAt: number } | null = null;
  let memoCache: { data: DashboardData; fetchedAt: number } | null = null;
  let inflight: Promise<DashboardData> | null = null;

  async function refresh(): Promise<DashboardData> {
    const now = clock();
    const fresh = await fetch();

    if (fresh.state === "ok") {
      const entry = { data: fresh, fetchedAt: now };
      goodCache = entry;
      memoCache = entry;
      return fresh;
    }

    if (fresh.state !== "unauthorized" && goodCache) {
      const stale: DashboardData = { ...goodCache.data, stale: true };
      memoCache = { data: stale, fetchedAt: now };
      return stale;
    }

    memoCache = { data: fresh, fetchedAt: now };
    return fresh;
  }

  function load(): Promise<DashboardData> {
    const now = clock();
    if (memoCache && now - memoCache.fetchedAt < ttlMs) {
      return Promise.resolve(memoCache.data);
    }
    inflight ??= refresh().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  /** Yazmadan sonra çağrılır: memo boşalır, bir sonraki okuma ağa gider (goodCache korunur). */
  load.invalidate = () => {
    memoCache = null;
  };

  return load;
}

export const loadDashboard: DashboardLoader = createDashboardLoader(fetchDashboardData);
