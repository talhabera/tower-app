import Link from "next/link";
import { DurumRozeti } from "@/components/durum-rozeti";
import { Kart } from "@/components/kart";
import { TokenGecersizBandi } from "@/components/token-gecersiz-bandi";
import { YedekAcButonu } from "@/components/yedek-ac-butonu";
import { loadDashboard, UNREACHABLE_MESSAGE } from "@/server/dashboard";
import { requireSession } from "@/server/session";
import { getStore } from "@/server/store";
import { isWriter } from "@/server/writers";

export const revalidate = 10;

export default async function Yedekleme() {
  const session = await requireSession();
  const data = await loadDashboard();
  const yazici = isWriter(session.email, process.env.TOWER_WRITER_EMAILS);
  const preset = yazici ? await getStore()?.getBackupPreset() : undefined;
  const ozet = preset ? `${preset.frequency} · ${preset.keepLocal} yerel / ${preset.keepS3} S3` : "";

  if (data.state === "unauthorized") return <TokenGecersizBandi />;

  if (data.state !== "ok") {
    return (
      <main className="p-8">
        <Kart baslik="Yedekleme" tazelik="ulasilamiyor">
          <p className="text-sm">{data.message ?? UNREACHABLE_MESSAGE}</p>
        </Kart>
      </main>
    );
  }

  // Yedekleri okunamayanlar sayılmaz: durumu bilinmeyen veritabanı "korumasız" diye sunulmaz.
  const korumasiz = data.databases.filter((db) => !db.backupsFailure && !db.backups.some((b) => b.enabled)).length;

  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Yedekleme &amp; Depolama</h1>
      {yazici && (
        <div className="flex gap-4 text-sm">
          {korumasiz > 0 && (
            <Link href="/yedekleme/koru" className="underline">
              {`Korumasız ${korumasiz} veritabanını koru`}
            </Link>
          )}
          <Link href="/yedekleme/preset" className="underline">
            Preset&apos;i düzenle
          </Link>
          <Link href="/denetim" className="underline">
            Denetim kaydı
          </Link>
        </div>
      )}

      <Kart
        baslik="Veritabanları"
        tazelik={data.failures.databases ? "ulasilamiyor" : data.stale ? "bayat" : "taze"}
        zaman={data.loadedAt}
      >
        {data.failures.databases ? (
          <p className="text-sm text-amber-700">okunamadı — {data.failures.databases}</p>
        ) : data.databases.length === 0 ? (
          <p className="text-sm text-neutral-500">Veritabanı bulunamadı.</p>
        ) : (
          <ul className="text-sm">
            {data.databases.map((db) => {
              const aktif = db.backups.filter((b) => b.enabled);
              return (
                <li key={db.uuid} className="flex items-center gap-3 border-t border-neutral-100 py-2">
                  <span className="min-w-0 flex-1 truncate">{db.name}</span>
                  <DurumRozeti status={db.status} />
                  {db.backupsFailure ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 ring-1 ring-amber-300">
                      okunamadı
                    </span>
                  ) : aktif.length === 0 ? (
                    <>
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-900 ring-1 ring-red-300">
                        yedek yok
                      </span>
                      {yazici && preset && <YedekAcButonu uuid={db.uuid} name={db.name} ozet={ozet} />}
                    </>
                  ) : (
                    <span className="shrink-0 text-xs text-neutral-600">
                      {aktif.map((b) => `${b.frequency}${b.saveToS3 ? " · S3" : ""}`).join(", ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Kart>

      <Kart
        baslik="S3 depolama hedefleri"
        tazelik={data.failures.storages ? "ulasilamiyor" : data.stale ? "bayat" : "taze"}
        zaman={data.loadedAt}
      >
        {data.failures.storages ? (
          <p className="text-sm text-amber-700">okunamadı — {data.failures.storages}</p>
        ) : data.storages.length === 0 ? (
          <p className="text-sm text-red-800">
            Tanımlı S3 hedefi yok. Yedek programı açılsa bile yedekler dışarı yazılamaz.
          </p>
        ) : (
          <ul className="text-sm">
            {data.storages.map((s) => (
              <li key={s.uuid} className="flex items-center gap-3 border-t border-neutral-100 py-2">
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-xs text-neutral-500">
                  {s.bucket} · {s.endpoint}
                </span>
                <span className={`text-xs ${s.usable ? "text-emerald-700" : "text-red-700"}`}>
                  {s.usable ? "kullanılabilir" : "doğrulanamadı"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Kart>
    </main>
  );
}
