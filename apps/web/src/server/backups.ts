import "server-only";
import type { DatabaseBackup, Result } from "@tower/coolify";
import type { BackupScheduleInput } from "@tower/coolify/write";
import { performWrite, type WriteDeps, type WriteError, type WriteOutcome } from "./write";

export type BackupPorts = {
  getBackups(dbUuid: string): Promise<Result<DatabaseBackup[]>>;
  create(dbUuid: string, input: BackupScheduleInput): Promise<Result<{ uuid: string }>>;
};

export type RowStatus = "ok" | "failed" | "skipped";
export type BackupRow = { uuid: string; name: string; status: RowStatus; error?: WriteError };

export function hasActiveSchedule(backups: DatabaseBackup[]): boolean {
  return backups.some((b) => b.enabled);
}

/**
 * Tek veritabanına preset'le yedek programı kurar. Önce CANLI okur: etkin
 * program varsa yazmadan `skipped` döner (idempotent; toplu işlemin tekrarı güvenli).
 */
export async function enableBackup(
  deps: WriteDeps,
  ports: BackupPorts,
  actorEmail: string,
  db: { uuid: string; name: string },
  input: BackupScheduleInput,
  parentId?: string,
): Promise<BackupRow> {
  const existing = await ports.getBackups(db.uuid);
  if (!existing.ok) return { ...db, status: "failed", error: existing.error };
  if (hasActiveSchedule(existing.value)) return { ...db, status: "skipped" };

  const r = await performWrite(
    deps,
    { actorEmail, action: "backup.create", target: db.uuid, payload: input, parentId: parentId ?? null },
    () => ports.create(db.uuid, input),
  );
  return r.ok ? { ...db, status: "ok" } : { ...db, status: "failed", error: r.error };
}

/** Veritabanlarını SIRAYLA korur; ebeveyn satır yalnızca hepsi ok/skipped ise ok. */
export async function protectAll(
  deps: WriteDeps,
  ports: BackupPorts,
  actorEmail: string,
  dbs: { uuid: string; name: string }[],
  input: BackupScheduleInput,
): Promise<{ outcome: WriteOutcome<BackupRow[]>; rows: BackupRow[] }> {
  const rows: BackupRow[] = [];
  const outcome = await performWrite(
    deps,
    {
      actorEmail,
      action: "backup.protect_all",
      target: null,
      payload: { ...input, databases: dbs.map((d) => d.uuid) },
    },
    async (parentId) => {
      for (const db of dbs) {
        rows.push(await enableBackup(deps, ports, actorEmail, db, input, parentId));
      }
      const failedDbs = rows.filter((r) => r.status === "failed").map((r) => ({ uuid: r.uuid, name: r.name }));
      return failedDbs.length === 0
        ? { ok: true as const, value: rows }
        : {
            ok: false as const,
            error: { kind: "partial" as const, message: `${failedDbs.length}/${rows.length} veritabanı korunamadı.` },
            // Ebeveyn satır hangi veritabanlarının başarısız olduğunu adıyla saklar
            // (result: null yerine) — /denetim kısmi hatada kör kalmasın.
            detail: { failedDatabases: failedDbs },
          };
    },
  );
  return { outcome, rows };
}
