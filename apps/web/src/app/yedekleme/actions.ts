"use server";

import { revalidatePath } from "next/cache";
import { enableBackup, protectAll, type BackupRow } from "@/server/backups";
import { backupPorts, listUnprotected, liveStorages } from "@/server/backup-ports";
import { loadDashboard } from "@/server/dashboard";
import { parsePresetForm, presetTarget } from "@/server/preset";
import { requireSession } from "@/server/session";
import { getStore } from "@/server/store";
import { performWrite, type WriteDeps } from "@/server/write";
import { isWriter } from "@/server/writers";

export type ActionState = { ok: boolean; message: string; rows?: BackupRow[] } | null;

const YETKI_YOK: ActionState = { ok: false, message: "Bu işlem için yazma yetkiniz yok." };
const DB_YOK = "DATABASE_URL tanımlı değil; yazma kapalı.";

function yazabilir(email: string): boolean {
  return isWriter(email, process.env.TOWER_WRITER_EMAILS);
}

function deps(): WriteDeps {
  return { store: getStore(), writers: process.env.TOWER_WRITER_EMAILS };
}

function done() {
  loadDashboard.invalidate();
  revalidatePath("/yedekleme");
  revalidatePath("/denetim");
}

/** Preset + canlı S3 listesinden Coolify girdisi; store yoksa db hatası. */
async function resolveInput() {
  const store = getStore();
  if (!store) return { ok: false as const, message: DB_YOK };
  const [preset, storages] = await Promise.all([store.getBackupPreset(), liveStorages()]);
  if (!storages.ok) return { ok: false as const, message: storages.error.message };
  const target = presetTarget(preset, storages.value);
  return target.ok ? { ok: true as const, value: target.value } : { ok: false as const, message: target.error.message };
}

export async function enableBackupAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireSession();
  if (!yazabilir(session.email)) return YETKI_YOK;
  const uuid = String(form.get("uuid") ?? "");
  const name = String(form.get("name") ?? "");
  const ports = backupPorts();
  if (!ports.ok) return { ok: false, message: ports.error.message };
  const input = await resolveInput();
  if (!input.ok) return { ok: false, message: input.message };

  const row = await enableBackup(deps(), ports.value, session.email, { uuid, name }, input.value);
  done();
  if (row.status === "skipped") return { ok: true, message: "Zaten etkin bir yedek programı var." };
  return row.status === "ok"
    ? { ok: true, message: "Yedek programı kuruldu." }
    : { ok: false, message: row.error?.message ?? "Uygulanmadı, tekrar deneyin." };
}

export async function protectAllAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  const session = await requireSession();
  if (!yazabilir(session.email)) return YETKI_YOK;
  const ports = backupPorts();
  if (!ports.ok) return { ok: false, message: ports.error.message };
  const input = await resolveInput();
  if (!input.ok) return { ok: false, message: input.message };
  const list = await listUnprotected();
  if (!list.ok) return { ok: false, message: list.error.message };

  const { outcome, rows } = await protectAll(deps(), ports.value, session.email, list.value, input.value);
  done();
  return outcome.ok
    ? { ok: true, message: `${rows.length} veritabanı işlendi.`, rows }
    : { ok: false, message: outcome.error.message, rows };
}

export async function savePresetAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireSession();
  if (!yazabilir(session.email)) return YETKI_YOK;
  const storages = await liveStorages();
  if (!storages.ok) return { ok: false, message: storages.error.message };
  const parsed = parsePresetForm(form, storages.value.filter((s) => s.usable).map((s) => s.uuid));
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const store = getStore();
  if (!store) return { ok: false, message: DB_YOK };
  const r = await performWrite(
    { store, writers: process.env.TOWER_WRITER_EMAILS },
    { actorEmail: session.email, action: "preset.update", target: null, payload: parsed.value },
    async () => {
      await store.upsertBackupPreset({ ...parsed.value, updatedBy: session.email });
      return { ok: true as const, value: parsed.value };
    },
  );
  done();
  return r.ok ? { ok: true, message: "Preset kaydedildi." } : { ok: false, message: r.error.message };
}
