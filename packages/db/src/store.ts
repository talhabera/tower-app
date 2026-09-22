import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { auditLog, backupPreset } from "./schema";

export type AuditAction = "backup.create" | "backup.protect_all" | "preset.update";
export type AuditStatus = "pending" | "ok" | "failed";

export type NewAudit = {
  actorEmail: string;
  action: AuditAction;
  target: string | null;
  payload: unknown;
  parentId?: string | null;
};

export type AuditFinish = { status: "ok" | "failed"; errorKind?: string | null; result?: unknown };

export type AuditRow = {
  id: string;
  actorEmail: string;
  action: string;
  target: string | null;
  payload: unknown;
  status: AuditStatus;
  errorKind: string | null;
  result: unknown;
  parentId: string | null;
  createdAt: Date;
  finishedAt: Date | null;
};

export type BackupPreset = {
  frequency: string;
  keepLocal: number;
  keepS3: number;
  s3StorageUuid: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
};

export const DEFAULT_PRESET: BackupPreset = {
  frequency: "0 3 * * *",
  keepLocal: 7,
  keepS3: 30,
  s3StorageUuid: null,
  updatedBy: null,
  updatedAt: null,
};

export interface TowerStore {
  appendAudit(entry: NewAudit): Promise<string>;
  finishAudit(id: string, finish: AuditFinish): Promise<void>;
  listAudit(limit: number): Promise<AuditRow[]>;
  getBackupPreset(): Promise<BackupPreset>;
  upsertBackupPreset(preset: Omit<BackupPreset, "updatedAt">): Promise<void>;
  close(): Promise<void>;
}

const PRESET_ID = 1;

export function createStore(url: string): TowerStore {
  // connect_timeout: sürücü varsayılanı 30 sn; kesik bağlantıda okuma sayfaları
  // ve yazma eylemleri bu kadar süre asılı kalmasın diye 5 sn'ye düşürüldü.
  const sql = postgres(url, { max: 5, connect_timeout: 5 });
  const db = drizzle(sql);

  return {
    async appendAudit(entry) {
      const [row] = await db
        .insert(auditLog)
        .values({
          actorEmail: entry.actorEmail,
          action: entry.action,
          target: entry.target,
          payload: entry.payload ?? {},
          status: "pending",
          parentId: entry.parentId ?? null,
        })
        .returning({ id: auditLog.id });
      return row.id;
    },

    async finishAudit(id, finish) {
      await db
        .update(auditLog)
        .set({
          status: finish.status,
          errorKind: finish.errorKind ?? null,
          result: finish.result ?? null,
          finishedAt: new Date(),
        })
        .where(eq(auditLog.id, id));
    },

    async listAudit(limit) {
      const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
      return rows.map((r) => ({ ...r, status: r.status as AuditStatus }));
    },

    async getBackupPreset() {
      const [row] = await db.select().from(backupPreset).where(eq(backupPreset.id, PRESET_ID));
      if (!row) return { ...DEFAULT_PRESET };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...preset } = row;
      return preset;
    },

    async upsertBackupPreset(preset) {
      const values = { ...preset, updatedAt: new Date() };
      await db
        .insert(backupPreset)
        .values({ id: PRESET_ID, ...values })
        .onConflictDoUpdate({ target: backupPreset.id, set: values });
    },

    async close() {
      await sql.end();
    },
  };
}
