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

export type DashboardData = {
  state: "ok" | "unauthorized" | "unreachable";
  fleet: Fleet | null;
  risks: RiskReport | null;
  databases: DatabaseSummary[];
  storages: S3Storage[];
  loadedAt: string | null;
  /** Yükleme başarısız olduğunda, elde bir önceki iyi veri varsa true olur. */
  stale: boolean;
  message?: string;
};

/** Saf dönüşüm — test edilebilir olsun diye ağ çağrısından ayrıldı. */
export function toDashboard(
  fleetResult: Result<Fleet>,
  databases: DatabaseSummary[],
  applications: ApplicationDetail[],
  storages: S3Storage[],
): DashboardData {
  if (!isOk(fleetResult)) {
    const state = fleetResult.error.kind === "unauthorized" ? "unauthorized" : "unreachable";
    return {
      state,
      fleet: null,
      risks: null,
      databases: [],
      storages: [],
      loadedAt: null,
      stale: false,
      message: fleetResult.error.message,
    };
  }

  return {
    state: "ok",
    fleet: fleetResult.value,
    risks: computeRisks({ fleet: fleetResult.value, databases, applications }),
    databases,
    storages,
    loadedAt: fleetResult.value.loadedAt,
    stale: false,
  };
}

async function fetchDashboardData(): Promise<DashboardData> {
  const http = getCoolify();
  if (!isOk(http)) {
    return {
      state: "unreachable",
      fleet: null,
      risks: null,
      databases: [],
      storages: [],
      loadedAt: null,
      stale: false,
      message: http.error.message,
    };
  }

  const fleetResult = await loadFleet(http.value);

  const dbList = await listDatabases(http.value);
  const databases = isOk(dbList)
    ? await mapPool(dbList.value, 6, async (db) => {
        const backups = await getDatabaseBackups(http.value, db.uuid);
        return { ...db, backups: isOk(backups) ? backups.value : [] };
      })
    : [];

  const appUuids = isOk(fleetResult)
    ? fleetResult.value.projects
        .flatMap((p) => p.environments)
        .flatMap((e) => e.resources)
        .filter((r) => r.kind === "application")
        .map((r) => r.uuid)
    : [];

  const applications = (await mapPool(appUuids, 6, async (uuid) => getApplication(http.value, uuid)))
    .filter(isOk)
    .map((r) => r.value);

  const storageResult = await listS3Storages(http.value);

  return toDashboard(fleetResult, databases, applications, isOk(storageResult) ? storageResult.value : []);
}

export type DashboardFetcher = () => Promise<DashboardData>;
export type Clock = () => number;

const DASHBOARD_TTL_MS = 10_000;

/**
 * `fetch`'i process-level bir bellekle (10 sn TTL) sarar.
 * TTL içinde tekrar çağrılırsa son sonucu döner (ağa gitmez).
 * TTL dolduğunda ağa gider; başarısız olursa ve elde bir önceki başarılı
 * veri varsa onu `stale: true` ile döner. Önceki iyi veri yoksa hatayı döner.
 * Test edilebilirlik için saat dışarıdan verilebilir.
 */
export function createDashboardLoader(
  fetch: DashboardFetcher,
  ttlMs: number = DASHBOARD_TTL_MS,
  clock: Clock = () => Date.now(),
): DashboardFetcher {
  let goodCache: { data: DashboardData; fetchedAt: number } | null = null;
  let memoCache: { data: DashboardData; fetchedAt: number } | null = null;

  return async function load(): Promise<DashboardData> {
    const now = clock();
    if (memoCache && now - memoCache.fetchedAt < ttlMs) {
      return memoCache.data;
    }

    const fresh = await fetch();

    if (fresh.state === "ok") {
      const entry = { data: fresh, fetchedAt: now };
      goodCache = entry;
      memoCache = entry;
      return fresh;
    }

    if (goodCache) {
      const stale: DashboardData = { ...goodCache.data, stale: true };
      memoCache = { data: stale, fetchedAt: now };
      return stale;
    }

    memoCache = { data: fresh, fetchedAt: now };
    return fresh;
  };
}

export const loadDashboard: DashboardFetcher = createDashboardLoader(fetchDashboardData);
