import { redirect } from "next/navigation";
import { Kart } from "@/components/kart";
import { PresetFormu } from "@/components/preset-formu";
import { liveStorages } from "@/server/backup-ports";
import { requireSession } from "@/server/session";
import { getStore } from "@/server/store";
import { isWriter } from "@/server/writers";

export default async function PresetSayfasi() {
  const session = await requireSession();
  if (!isWriter(session.email, process.env.TOWER_WRITER_EMAILS)) redirect("/yedekleme");
  const store = getStore();
  if (!store) {
    return (
      <main className="p-8">
        <Kart baslik="Yedek preset'i" tazelik="ulasilamiyor">
          <p className="text-sm">DATABASE_URL tanımlı değil; yazma kapalı.</p>
        </Kart>
      </main>
    );
  }
  const [preset, storages] = await Promise.all([store.getBackupPreset(), liveStorages()]);
  if (!storages.ok) {
    return (
      <main className="p-8">
        <Kart baslik="Yedek preset'i" tazelik="ulasilamiyor">
          <p className="text-sm text-red-700">S3 hedefleri okunamadı — {storages.error.message}</p>
        </Kart>
      </main>
    );
  }
  const usable = storages.value.filter((s) => s.usable);
  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Yedek preset&apos;i</h1>
      <PresetFormu
        preset={preset}
        storages={usable.map(({ uuid, name, bucket }) => ({ uuid, name, bucket }))}
      />
    </main>
  );
}
