import type { S3Storage } from "@tower/coolify";
import type { BackupScheduleInput } from "@tower/coolify/write";
import type { BackupPreset } from "@tower/db";
import type { StepResult } from "./write";

const KEYWORDS = new Set(["every_minute", "hourly", "daily", "weekly", "monthly", "yearly"]);
const CRON_FIELD = /^[0-9*,/-]+$/;

function validFrequency(v: string): boolean {
  if (KEYWORDS.has(v)) return true;
  const fields = v.split(/\s+/);
  return v.length <= 64 && fields.length === 5 && fields.every((f) => CRON_FIELD.test(f));
}

function retention(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 365 ? n : null;
}

/** Preset'ten Coolify girdisi; hedef S3 yoksa veya kullanılamıyorsa needs_s3. */
export function presetTarget(preset: BackupPreset, storages: S3Storage[]): StepResult<BackupScheduleInput> {
  const target = storages.find((s) => s.uuid === preset.s3StorageUuid);
  if (!preset.s3StorageUuid || !target?.usable) {
    return { ok: false, error: { kind: "needs_s3", message: "Preset'te kullanılabilir bir S3 hedefi seçili değil." } };
  }
  return {
    ok: true,
    value: {
      frequency: preset.frequency,
      s3StorageUuid: preset.s3StorageUuid,
      keepLocal: preset.keepLocal,
      keepS3: preset.keepS3,
    },
  };
}

export type PresetForm = { frequency: string; keepLocal: number; keepS3: number; s3StorageUuid: string };

export function parsePresetForm(
  form: FormData,
  usableUuids: string[],
): { ok: true; value: PresetForm } | { ok: false; message: string } {
  const frequency = String(form.get("frequency") ?? "").trim();
  if (!validFrequency(frequency)) {
    return { ok: false, message: "Sıklık 5 alanlı cron (ör. 0 3 * * *) ya da daily/hourly/... olmalı." };
  }
  const keepLocal = retention(form.get("keepLocal"));
  const keepS3 = retention(form.get("keepS3"));
  if (keepLocal === null || keepS3 === null) {
    return { ok: false, message: "Saklama sayıları 1 ile 365 arasında tam sayı olmalı." };
  }
  const s3StorageUuid = String(form.get("s3StorageUuid") ?? "");
  if (!usableUuids.includes(s3StorageUuid)) {
    return { ok: false, message: "Kullanılabilir bir S3 hedefi seçin." };
  }
  return { ok: true, value: { frequency, keepLocal, keepS3, s3StorageUuid } };
}
