import { redirect } from "next/navigation";
import { KoruFormu } from "@/components/koru-formu";
import { listUnprotected, liveStorages } from "@/server/backup-ports";
import { presetTarget } from "@/server/preset";
import { requireSession } from "@/server/session";
import { getStore } from "@/server/store";
import { isWriter } from "@/server/writers";

export const dynamic = "force-dynamic";

export default async function KoruSayfasi() {
  const session = await requireSession();
  if (!isWriter(session.email, process.env.TOWER_WRITER_EMAILS)) redirect("/yedekleme");
  const store = getStore();
  if (!store) return <main className="p-8 text-sm">DATABASE_URL tanımlı değil; yazma kapalı.</main>;

  const [preset, storages, list] = await Promise.all([store.getBackupPreset(), liveStorages(), listUnprotected()]);
  const target = presetTarget(preset, storages.ok ? storages.value : []);
  if (!target.ok) redirect("/yedekleme/preset");
  if (!list.ok) return <main className="p-8 text-sm text-red-700">{list.error.message}</main>;

  const hedef = storages.ok ? storages.value.find((s) => s.uuid === target.value.s3StorageUuid)?.name : "";
  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Korumasız veritabanlarını koru</h1>
      <p className="text-sm text-neutral-700">
        Her birine şu program kurulacak: <code>{target.value.frequency}</code>, yerelde {target.value.keepLocal},
        S3&apos;te {target.value.keepS3} yedek → <strong>{hedef}</strong>.
      </p>
      <ul className="text-sm">
        {list.value.map((d) => (
          <li key={d.uuid} className="border-t border-neutral-100 py-1">
            {d.name}
          </li>
        ))}
      </ul>
      <KoruFormu adet={list.value.length} />
    </main>
  );
}
