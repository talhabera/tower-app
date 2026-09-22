import { DurumRozeti } from "@/components/durum-rozeti";
import { Kart } from "@/components/kart";
import { loadDashboard } from "@/server/dashboard";
import { requireSession } from "@/server/session";

export const revalidate = 10;

export default async function Yedekleme() {
  await requireSession();
  const data = await loadDashboard();

  if (data.state !== "ok") {
    return (
      <main className="p-8">
        <Kart baslik="Yedekleme" tazelik="ulasilamiyor">
          <p className="text-sm">{data.message ?? "Coolify'a ulaşılamadı."}</p>
        </Kart>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Yedekleme &amp; Depolama</h1>

      <Kart baslik="Veritabanları" tazelik={data.stale ? "bayat" : "taze"} zaman={data.loadedAt}>
        {data.databases.length === 0 ? (
          <p className="text-sm text-neutral-500">Veritabanı bulunamadı.</p>
        ) : (
          <ul className="text-sm">
            {data.databases.map((db) => {
              const aktif = db.backups.filter((b) => b.enabled);
              return (
                <li key={db.uuid} className="flex items-center gap-3 border-t border-neutral-100 py-2">
                  <span className="min-w-0 flex-1 truncate">{db.name}</span>
                  <DurumRozeti status={db.status} />
                  {aktif.length === 0 ? (
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-900 ring-1 ring-red-300">
                      yedek yok
                    </span>
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

      <Kart baslik="S3 depolama hedefleri" tazelik={data.stale ? "bayat" : "taze"} zaman={data.loadedAt}>
        {data.storages.length === 0 ? (
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
