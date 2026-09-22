/**
 * @tower/coolify/write — Coolify'a YAZAN tek giriş.
 * Kök giriş (@tower/coolify) bu modülü dışa aktarmaz; yalnızca apps/web
 * içindeki performWrite geçidi buradan import eder.
 */
import type { CoolifyWriteHttp } from "./http";
import { err, ok, type Result } from "./result";
import { seg } from "./segment";

export type { CoolifyWriteHttp } from "./http";
export { createWriteClient } from "./http";

export type BackupScheduleInput = {
  frequency: string;
  s3StorageUuid: string;
  keepLocal: number;
  keepS3: number;
};

/** Coolify 4.3.23 `POST /databases/{uuid}/backups` gövdesi. */
export function backupScheduleBody(input: BackupScheduleInput): Record<string, unknown> {
  return {
    frequency: input.frequency,
    enabled: true,
    save_s3: true,
    s3_storage_uuid: input.s3StorageUuid,
    database_backup_retention_amount_locally: input.keepLocal,
    database_backup_retention_amount_s3: input.keepS3,
  };
}

export async function createBackupSchedule(
  http: CoolifyWriteHttp,
  databaseUuid: string,
  input: BackupScheduleInput,
): Promise<Result<{ uuid: string }>> {
  const id = seg(databaseUuid);
  if (!id.ok) return id;
  const r = await http.post<unknown>(`/databases/${id.value}/backups`, backupScheduleBody(input));
  if (!r.ok) return r;
  const uuid = (r.value as { uuid?: unknown } | null)?.uuid;
  if (typeof uuid !== "string" || uuid === "") {
    return err("malformed", "Yedek programı oluşturuldu ama cevapta uuid yok");
  }
  return ok({ uuid });
}
