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

export type DbRef = { uuid: string; name: string };
export type UnprotectedList = { unprotected: DbRef[]; unreadable: DbRef[] };

/**
 * Onay ekranı ve toplu işlem için CANLI (önbelleksiz) liste. Yedekleri okunamayan
 * veritabanları `unreadable`'a ayrılır ve toplu işlemde İŞLENMEZ.
 */
export async function listUnprotected(): Promise<Result<UnprotectedList>> {
  const http = getCoolify();
  if (!http.ok) return http;
  const dbs = await listDatabases(http.value);
  if (!dbs.ok) return dbs;
  const unprotected: DbRef[] = [];
  const unreadable: DbRef[] = [];
  for (const db of dbs.value) {
    const b = await getDatabaseBackups(http.value, db.uuid);
    const ref = { uuid: db.uuid, name: db.name };
    if (!b.ok) unreadable.push(ref);
    else if (!hasActiveSchedule(b.value)) unprotected.push(ref);
  }
  return { ok: true, value: { unprotected, unreadable } };
}

export async function liveStorages(): Promise<Result<S3Storage[]>> {
  const http = getCoolify();
  if (!http.ok) return http;
  return listS3Storages(http.value);
}
