import Link from "next/link";
import { Kart } from "@/components/kart";
import { loadDashboard } from "@/server/dashboard";
import { requireSession } from "@/server/session";

export const revalidate = 10;

function Sayac({
  baslik,
  sayi,
  href,
  aciklama,
}: {
  baslik: string;
  sayi: number;
  href: string;
  aciklama: string;
}) {
  const tehlike = sayi > 0;
  return (
    <Link
      href={href}
      className={`block rounded-lg border p-4 transition ${
        tehlike
          ? "border-red-300 bg-red-50 hover:bg-red-100"
          : "border-neutral-200 bg-white hover:bg-neutral-50"
      }`}
    >
      <div className={`text-3xl font-semibold ${tehlike ? "text-red-700" : "text-neutral-400"}`}>
        {sayi}
      </div>
      <div className="mt-1 text-sm font-medium text-neutral-900">{baslik}</div>
      <p className="mt-1 text-xs text-neutral-600">{aciklama}</p>
    </Link>
  );
}

export default async function GenelDurum() {
  await requireSession();
  const data = await loadDashboard();

  if (data.state === "unauthorized") {
    return (
      <main className="p-8">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
          Coolify token&apos;ı geçersiz. <code>.env.local</code> içindeki <code>COOLIFY_TOKEN</code>{" "}
          yenilenmeli.
        </div>
      </main>
    );
  }

  if (data.state === "unreachable" || !data.risks) {
    return (
      <main className="p-8">
        <Kart baslik="Genel Durum" tazelik="ulasilamiyor">
          <p className="text-sm text-neutral-700">{data.message ?? "Coolify'a ulaşılamadı."}</p>
        </Kart>
      </main>
    );
  }

  const r = data.risks;

  const failedProjects = data.fleet?.projects.filter((p) => p.failure) ?? [];
  const failedEnvironments =
    data.fleet?.projects.flatMap((p) =>
      p.environments
        .filter((e) => e.failure)
        .map((e) => ({ uuid: e.uuid, label: `${p.name} / ${e.name}`, failure: e.failure! })),
    ) ?? [];
  const hasFailures = failedProjects.length > 0 || failedEnvironments.length > 0;

  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Genel Durum</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Sayac
          baslik="Yedeksiz veritabanı"
          sayi={r.unbackedDatabases.count}
          href="/yedekleme"
          aciklama="Yedek programı tanımlı olmayan veya devre dışı bırakılmış veritabanları"
        />
        <Sayac
          baslik="Healthcheck'siz uygulama"
          sayi={r.healthcheckDisabledApps.count}
          href="/filo?filtre=healthcheck"
          aciklama="Çöktüğünde çalışıyor görünecek uygulamalar"
        />
        <Sayac
          baslik="Düşmüş kaynak"
          sayi={r.downResources.count}
          href="/filo?filtre=dusmus"
          aciklama="Çalışmayan uygulama, servis veya veritabanı"
        />
        <Sayac
          baslik="Sorunlu sunucu"
          sayi={r.unreachableServers.count}
          href="/filo"
          aciklama="Erişilemeyen veya kullanılamaz durumdaki sunucular"
        />
      </div>

      {hasFailures && (
        <Kart baslik="Okunamayan kaynaklar" tazelik="ulasilamiyor">
          <ul className="space-y-1 text-sm text-red-800">
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
