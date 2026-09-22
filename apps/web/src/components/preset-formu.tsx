"use client";

import { useActionState } from "react";
import { savePresetAction, type ActionState } from "@/app/yedekleme/actions";

type Props = {
  preset: { frequency: string; keepLocal: number; keepS3: number; s3StorageUuid: string | null };
  storages: { uuid: string; name: string; bucket: string }[];
};

export function PresetFormu({ preset, storages }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(savePresetAction, null);
  return (
    <form action={action} className="max-w-md space-y-3 text-sm">
      <label className="block">
        Sıklık (cron)
        <input name="frequency" defaultValue={preset.frequency} className="mt-1 block w-full rounded border px-2 py-1" />
        <span className="text-xs text-neutral-500">Cron, Coolify sunucusunun saat diliminde çalışır.</span>
      </label>
      <label className="block">
        Yerelde saklanacak yedek sayısı
        <input name="keepLocal" type="number" min={1} max={365} defaultValue={preset.keepLocal} className="mt-1 block w-full rounded border px-2 py-1" />
      </label>
      <label className="block">
        S3&apos;te saklanacak yedek sayısı
        <input name="keepS3" type="number" min={1} max={365} defaultValue={preset.keepS3} className="mt-1 block w-full rounded border px-2 py-1" />
      </label>
      <label className="block">
        Hedef S3
        <select name="s3StorageUuid" defaultValue={preset.s3StorageUuid ?? ""} className="mt-1 block w-full rounded border px-2 py-1">
          <option value="" disabled>
            Seçin
          </option>
          {storages.map((s) => (
            <option key={s.uuid} value={s.uuid}>
              {s.name} ({s.bucket})
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-1 text-white">
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </button>
      {state && <p className={state.ok ? "text-emerald-700" : "text-red-700"}>{state.message}</p>}
      <p className="text-xs text-neutral-500">Preset yalnızca yeni kurulan programlara uygulanır.</p>
    </form>
  );
}
