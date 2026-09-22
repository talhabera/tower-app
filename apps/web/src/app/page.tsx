import { Kart } from "@/components/kart";
import { Sayac } from "@/components/sayac";
import { TokenGecersizBandi } from "@/components/token-gecersiz-bandi";
import { loadDashboard, riskCounts, UNREACHABLE_MESSAGE } from "@/server/dashboard";
import { requireSession } from "@/server/session";

export const revalidate = 10;

export default async function GenelDurum() {
  await requireSession();
  const data = await loadDashboard();

  if (data.state === "unauthorized") return <TokenGecersizBandi />;

  if (data.state === "unreachable" || !data.risks) {
    return (
      <main className="p-8">
        <Kart baslik="Genel Durum" tazelik="ulasilamiyor">
          <p className="text-sm text-neutral-700">{data.message ?? UNREACHABLE_MESSAGE}</p>
        </Kart>
      </main>
    );
  }

  const sayilar = riskCounts(data.risks, data.failures);
  const f = data.failures;

  const failedProjects = data.fleet?.projects.filter((p) => p.failure) ?? [];
  const failedEnvironments =
    data.fleet?.projects.flatMap((p) =>
      p.environments
        .filter((e) => e.failure)
        .map((e) => ({ uuid: e.uuid, label: `${p.name} / ${e.name}`, failure: e.failure! })),
    ) ?? [];
  const sourceFailures: Array<{ key: string; text: string }> = [
    ...(f.servers ? [{ key: "servers", text: `Sunucu listesi: okunamadı — ${f.servers}` }] : []),
    ...(f.databases ? [{ key: "databases", text: `Veritabanı listesi: okunamadı — ${f.databases}` }] : []),
    ...(f.backups.length > 0
      ? [{ key: "backups", text: `${f.backups.length} veritabanının yedek programı okunamadı` }]
      : []),
    ...(f.applications.length > 0
      ? [{ key: "applications", text: `${f.applications.length} uygulamanın detayı okunamadı` }]
      : []),
    ...(f.storages ? [{ key: "storages", text: `S3 hedefleri: okunamadı — ${f.storages}` }] : []),
  ];
  const hasFailures =
    failedProjects.length > 0 || failedEnvironments.length > 0 || sourceFailures.length > 0;

  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Genel Durum</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Sayac
          baslik="Yedeksiz veritabanı"
          sayi={sayilar.unbackedDatabases}
          href="/yedekleme"
          aciklama="Yedek programı tanımlı olmayan veya devre dışı bırakılmış veritabanları"
        />
        <Sayac
          baslik="Healthcheck'siz uygulama"
          sayi={sayilar.healthcheckDisabledApps}
          href="/filo?filtre=healthcheck"
          aciklama="Çöktüğünde çalışıyor görünecek uygulamalar"
        />
        <Sayac
          baslik="Düşmüş kaynak"
          sayi={sayilar.downResources}
          href="/filo?filtre=dusmus"
          aciklama="Çalışmayan uygulama, servis veya veritabanı"
        />
        <Sayac
          baslik="Sorunlu sunucu"
          sayi={sayilar.unreachableServers}
          href="/filo"
          aciklama="Erişilemeyen veya kullanılamaz durumdaki sunucular"
        />
      </div>

      {hasFailures && (
        <Kart baslik="Okunamayan kaynaklar" tazelik="ulasilamiyor">
          <ul className="space-y-1 text-sm text-red-800">
            {sourceFailures.map((s) => (
              <li key={s.key}>{s.text}</li>
            ))}
            {failedProjects.map((p) => (
              <li key={p.uuid}>
                {p.name}: okunamadı — {p.failure}
              </li>
            ))}
            {failedEnvironments.map((e) => (
              <li key={e.uuid}>
                {e.label}: okunamadı — {e.failure}
              </li>
            ))}
          </ul>
        </Kart>
      )}

      <Kart baslik="Son okuma" tazelik={data.stale ? "bayat" : "taze"} zaman={data.loadedAt}>
        <p className="text-sm text-neutral-700">
          {data.fleet?.projects.length ?? 0} proje ·{" "}
          {data.fleet?.projects.flatMap((p) => p.environments).flatMap((e) => e.resources).length ?? 0}{" "}
          kaynak · {data.fleet?.servers.length ?? 0} sunucu
          {data.loadedAt ? ` · ${new Date(data.loadedAt).toLocaleString("tr-TR")}` : ""}
        </p>
      </Kart>
    </main>
  );
}
