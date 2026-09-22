"use client";

import { useActionState, useState } from "react";
import { enableBackupAction, type ActionState } from "@/app/yedekleme/actions";

/** İki adımlı: önce preset özeti + Onayla, sonra server action. */
export function YedekAcButonu({ uuid, name, ozet }: { uuid: string; name: string; ozet: string }) {
  const [acik, setAcik] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(enableBackupAction, null);

  if (state) {
    return <span className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>;
  }
  if (!acik) {
    return (
      <button type="button" onClick={() => setAcik(true)} className="rounded border px-2 py-0.5 text-xs">
        Yedeklemeyi aç
      </button>
    );
  }
  return (
    <form action={action} className="flex items-center gap-2 text-xs">
      <input type="hidden" name="uuid" value={uuid} />
      <input type="hidden" name="name" value={name} />
      <span className="text-neutral-600">{ozet}</span>
      <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-2 py-0.5 text-white">
        {pending ? "Kuruluyor…" : "Onayla"}
      </button>
      <button type="button" onClick={() => setAcik(false)} className="underline">
        İptal
      </button>
    </form>
  );
}
