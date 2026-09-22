import "server-only";
import { getDatabaseBackups, listDatabases, listS3Storages, readConfig, type Result, type S3Storage } from "@tower/coolify";
import { createBackupSchedule, createWriteClient } from "@tower/coolify/write";
import type { BackupPorts } from "./backups";
import { hasActiveSchedule } from "./backups";
import { getCoolify } from "./coolify";

/** Gerçek Coolify port'ları. Yazma istemcisi yalnızca burada kurulur. */
export function backupPorts(): Result<BackupPorts> {
  const config = readConfig(process.env);
  if (!config.ok) return config;
  const read = getCoolify();
  if (!read.ok) return read;
  const write = createWriteClient(config.value);
  return {
    ok: true,
    value: {
      getBackups: (uuid) => getDatabaseBackups(read.value, uuid),
      create: (uuid, input) => createBackupSchedule(write, uuid, input),
    },
  };
}

/** Onay ekranı için CANLI (önbelleksiz) korumasız veritabanı listesi. */
export async function listUnprotected(): Promise<Result<{ uuid: string; name: string }[]>> {
  const http = getCoolify();
  if (!http.ok) return http;
  const dbs = await listDatabases(http.value);
  if (!dbs.ok) return dbs;
  const out: { uuid: string; name: string }[] = [];
  for (const db of dbs.value) {
    const b = await getDatabaseBackups(http.value, db.uuid);
    if (!b.ok || !hasActiveSchedule(b.value)) out.push({ uuid: db.uuid, name: db.name });
  }
  return { ok: true, value: out };
}

export async function liveStorages(): Promise<Result<S3Storage[]>> {
  const http = getCoolify();
  if (!http.ok) return http;
  return listS3Storages(http.value);
}
