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

function deploymentUuidOf(value: unknown): string | undefined {
  const uuid = (value as { deployment_uuid?: unknown } | null | undefined)?.deployment_uuid;
  return typeof uuid === "string" && uuid !== "" ? uuid : undefined;
}

/** Coolify 4.7.0 `POST /applications/{uuid}/restart` — gövdesiz. */
export async function restartApplication(
  http: CoolifyWriteHttp,
  applicationUuid: string,
): Promise<Result<{ deploymentUuid: string }>> {
  const id = seg(applicationUuid);
  if (!id.ok) return id;
  const r = await http.post<unknown>(`/applications/${id.value}/restart`, undefined);
  if (!r.ok) return r;
  const deploymentUuid = deploymentUuidOf(r.value);
  if (deploymentUuid === undefined) {
    return err("malformed", "Yeniden başlatma kuyruğa alındı ama cevapta deployment_uuid yok");
  }
  return ok({ deploymentUuid });
}

/** Coolify 4.7.0 `POST /deploy?uuid={uuid}&force=false` — gövdesiz; ilk dağıtımın uuid'ini döner. */
export async function deployApplication(
  http: CoolifyWriteHttp,
  applicationUuid: string,
): Promise<Result<{ deploymentUuid: string }>> {
  const id = seg(applicationUuid);
  if (!id.ok) return id;
  const r = await http.post<unknown>(`/deploy?uuid=${id.value}&force=false`, undefined);
  if (!r.ok) return r;
  const deployments = (r.value as { deployments?: unknown } | null)?.deployments;
  const deploymentUuid = Array.isArray(deployments) ? deploymentUuidOf(deployments[0]) : undefined;
  if (deploymentUuid === undefined) {
    return err("malformed", "Dağıtım kuyruğa alındı ama cevapta deployment_uuid yok");
  }
  return ok({ deploymentUuid });
}

export type ApplicationEnvInput = {
  key: string;
  /** Yalnızca yazılır: hiçbir sonuçta, logda veya hata mesajında yer almaz. */
  value: string;
  /** true → PATCH (mevcut değişkeni günceller), false → POST (yeni oluşturur). */
  exists: boolean;
};

/**
 * Coolify 4.7.0 `POST|PATCH /applications/{uuid}/envs`. Yalnızca önizleme
 * olmayan değişkenler (`is_preview: false`). Sonuç `value` taşımaz.
 */
export async function upsertApplicationEnv(
  http: CoolifyWriteHttp,
  applicationUuid: string,
  input: ApplicationEnvInput,
): Promise<Result<{ key: string; created: boolean }>> {
  const id = seg(applicationUuid);
  if (!id.ok) return id;
  const path = `/applications/${id.value}/envs`;
  const body = { key: input.key, value: input.value, is_preview: false };
  // Cevap gövdesi kullanılmaz: değeri geri yansıtabilir.
  const r = input.exists ? await http.patch<unknown>(path, body) : await http.post<unknown>(path, body);
  if (!r.ok) return r;
  return ok({ key: input.key, created: !input.exists });
}
