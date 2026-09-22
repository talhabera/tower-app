"use client";

import { useActionState } from "react";
import { protectAllAction, type ActionState } from "@/app/yedekleme/actions";

const ETIKET = { ok: "kuruldu", skipped: "zaten var", failed: "başarısız" } as const;

export function KoruFormu({ adet }: { adet: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(protectAllAction, null);

  return (
    <div className="space-y-4">
      {!state && (
        <form action={action}>
          <button type="submit" disabled={pending || adet === 0} className="rounded bg-neutral-900 px-3 py-1 text-sm text-white">
            {pending ? "Sırayla işleniyor…" : `${adet} veritabanını koru`}
          </button>
        </form>
      )}
      {state && (
        <>
          <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>
          <ul className="text-sm">
            {(state.rows ?? []).map((r) => (
              <li key={r.uuid} className="flex gap-3 border-t border-neutral-100 py-1">
                <span className="flex-1">{r.name}</span>
                <span>{ETIKET[r.status]}</span>
                {r.error && <span className="text-xs text-red-700">{r.error.kind}</span>}
              </li>
            ))}
          </ul>
          {!state.ok && (
            <p className="text-xs text-neutral-600">
              Tekrar denemeden önce /yedekleme&apos;yi kontrol edin; tekrar çalıştırmak kurulu olanları atlar.
            </p>
          )}
        </>
      )}
    </div>
  );
}
