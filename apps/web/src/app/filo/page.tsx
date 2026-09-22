import { Kart } from "@/components/kart";
import { KaynakSatiri } from "@/components/kaynak-satiri";
import { TokenGecersizBandi } from "@/components/token-gecersiz-bandi";
import { loadDashboard, UNREACHABLE_MESSAGE } from "@/server/dashboard";
import { requireSession } from "@/server/session";

export const revalidate = 10;

export default async function Filo({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string }>;
}) {
  await requireSession();
  const { filtre } = await searchParams;
  const data = await loadDashboard();

  if (data.state === "unauthorized") return <TokenGecersizBandi />;

  if (data.state !== "ok" || !data.fleet) {
    return (
      <main className="p-8">
        <Kart baslik="Filo" tazelik="ulasilamiyor">
          <p className="text-sm">{data.message ?? UNREACHABLE_MESSAGE}</p>
        </Kart>
      </main>
    );
  }

  // Filtreler sayaçlarla AYNI tanımı kullanır: risk raporundaki uuid'ler.
  const healthcheckSiz = new Set(data.risks?.healthcheckDisabledApps.items.map((i) => i.uuid) ?? []);
  const dusmus = new Set(data.risks?.downResources.items.map((i) => i.uuid) ?? []);
  const eslesir = (uuid: string) => {
    if (filtre === "dusmus") return dusmus.has(uuid);
    if (filtre === "healthcheck") return healthcheckSiz.has(uuid);
    return true;
  };
  const filtreli = filtre === "dusmus" || filtre === "healthcheck";
  const projeler = filtreli
    ? data.fleet.projects.filter(
        (p) => p.failure || p.environments.some((e) => e.resources.some((k) => eslesir(k.uuid))),
      )
    : data.fleet.projects;

  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Filo</h1>

      <Kart
        baslik="Sunucular"
        tazelik={data.failures.servers ? "ulasilamiyor" : data.stale ? "bayat" : "taze"}
        zaman={data.loadedAt}
      >
        {data.failures.servers ? (
          <p className="text-sm text-amber-700">okunamadı — {data.failures.servers}</p>
        ) : (
          <ul className="text-sm">
            {data.fleet.servers.map((s) => (
              <li key={s.uuid} className="flex justify-between border-t border-neutral-100 py-2">
                <span>{s.name}</span>
                <span className={s.reachable && s.usable ? "text-emerald-700" : "text-red-700"}>
                  {s.reachable && s.usable ? "erişilebilir" : "sorunlu"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Kart>

      {projeler.map((proje) => (
        <Kart
          key={proje.uuid}
          baslik={proje.name}
          tazelik={proje.failure ? "ulasilamiyor" : data.stale ? "bayat" : "taze"}
          zaman={data.loadedAt}
        >
          {proje.failure ? (
            <p className="text-sm text-amber-700">{proje.failure}</p>
          ) : (
            proje.environments.map((ortam) => {
              const kaynaklar = ortam.resources.filter((k) => eslesir(k.uuid));
              if (kaynaklar.length === 0) return null;
              return (
                <div key={ortam.uuid} className="mb-3">
                  <h3 className="text-xs uppercase tracking-wide text-neutral-500">{ortam.name}</h3>
                  <ul>
                    {kaynaklar.map((k) => (
                      <KaynakSatiri key={k.uuid} kaynak={k} />
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </Kart>
      ))}
    </main>
  );
}
