import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  getApplication,
  getApplicationLogs,
  listApplicationDeployments,
  listApplicationEnvKeys,
  listApplicationScheduledTasks,
  listApplicationStorages,
  type Result,
} from "@tower/coolify";
import { DurumRozeti } from "@/components/durum-rozeti";
import { Kart } from "@/components/kart";
import { TokenGecersizBandi } from "@/components/token-gecersiz-bandi";
import { getCoolify } from "@/server/coolify";
import { requireSession } from "@/server/session";

export const revalidate = 10;

function Satir({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="flex gap-4 border-t border-neutral-100 py-2 text-sm">
      <span className="w-40 shrink-0 text-neutral-500">{etiket}</span>
      <span className="min-w-0 break-all">{deger || "—"}</span>
    </div>
  );
}

/**
 * Bağımsız okunan bir listeyi (depolar, görevler, dağıtımlar, ...) sarar.
 * Okuma başarısızsa yalnızca bu bölüm "okunamadı" gösterir — sayfanın geri
 * kalanı etkilenmez (ruling 3: her bölüm bağımsız bozulur).
 */
function ResultSection<T>({
  baslik,
  result,
  bos,
  children,
}: {
  baslik: string;
  result: Result<T[]>;
  bos: string;
  children: (items: T[]) => ReactNode;
}) {
  return (
    <Kart baslik={baslik} tazelik={result.ok ? "taze" : "ulasilamiyor"}>
      {!result.ok ? (
        <p className="text-sm text-neutral-500">okunamadı</p>
      ) : result.value.length === 0 ? (
        <p className="text-sm text-neutral-500">{bos}</p>
      ) : (
        children(result.value)
      )}
    </Kart>
  );
}

export default async function KaynakDetay({ params }: { params: Promise<{ uuid: string }> }) {
  await requireSession();
  const { uuid } = await params;

  const http = getCoolify();
  if (!http.ok) {
    return (
      <main className="p-8">
        <Kart baslik="Kaynak" tazelik="ulasilamiyor">
          <p className="text-sm">{http.error.message}</p>
        </Kart>
      </main>
    );
  }

  const app = await getApplication(http.value, uuid);
  if (!app.ok && app.error.kind === "unauthorized") return <TokenGecersizBandi />;
  if (!app.ok && app.error.kind === "not_found") notFound();
  if (!app.ok) {
    return (
      <main className="p-8">
        <Kart baslik="Kaynak" tazelik="ulasilamiyor">
          <p className="text-sm">{app.error.message}</p>
        </Kart>
      </main>
    );
  }

  const a = app.value;

  const [storages, scheduledTasks, deployments, envKeys, logs] = await Promise.all([
    listApplicationStorages(http.value, uuid),
    listApplicationScheduledTasks(http.value, uuid),
    listApplicationDeployments(http.value, uuid, 10),
    listApplicationEnvKeys(http.value, uuid),
    getApplicationLogs(http.value, uuid, 100),
  ]);

  return (
    <main className="space-y-6 p-8">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{a.name}</h1>
        <DurumRozeti status={a.status} />
      </div>

      {!a.healthCheckEnabled && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Healthcheck kapalı. Bu uygulama çöktüğünde Coolify bunu fark etmez.
        </div>
      )}

      <Kart baslik="Yapılandırma">
        <Satir etiket="Build pack" deger={a.buildPack} />
        <Satir etiket="Git deposu" deger={a.gitRepository} />
        <Satir etiket="Dal" deger={a.gitBranch} />
        <Satir etiket="Açık portlar" deger={a.portsExposed} />
        <Satir etiket="Healthcheck" deger={a.healthCheckEnabled ? `açık · ${a.healthCheckPath}` : "kapalı"} />
        <Satir etiket="Bellek limiti" deger={a.limitsMemory === "0" ? "sınırsız" : a.limitsMemory} />
        <Satir etiket="CPU limiti" deger={a.limitsCpus === "0" ? "sınırsız" : a.limitsCpus} />
      </Kart>

      <Kart baslik="Alan adları">
        {a.domains.length === 0 ? (
          <p className="text-sm text-neutral-500">Tanımlı alan adı yok.</p>
        ) : (
          <ul className="text-sm">
            {a.domains.map((d) => (
              <li key={d} className="border-t border-neutral-100 py-2">
                {d}
              </li>
            ))}
          </ul>
        )}
      </Kart>

      <ResultSection baslik="Kalıcı depolar" result={storages} bos="Tanımlı kalıcı depo yok.">
        {(items) => (
          <ul className="text-sm">
            {items.map((s) => (
              <li key={s.uuid} className="border-t border-neutral-100 py-2">
                {s.name} — {s.mountPath}
              </li>
            ))}
          </ul>
        )}
      </ResultSection>

      <ResultSection
        baslik="Zamanlanmış görevler"
        result={scheduledTasks}
        bos="Tanımlı zamanlanmış görev yok."
      >
        {(items) => (
          <ul className="text-sm">
            {items.map((t) => (
              <li key={t.uuid} className="flex justify-between border-t border-neutral-100 py-2">
                <span>{t.name}</span>
                <span className="text-neutral-500">
                  {t.frequency} · {t.enabled ? "açık" : "kapalı"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ResultSection>

      <ResultSection baslik="Son dağıtımlar" result={deployments} bos="Dağıtım kaydı yok.">
        {(items) => (
          <ul className="text-sm">
            {items.map((d, i) => (
              // uuid boş bir satır (kötü biçimlendirilmiş yanıt) mümkün olduğundan
              // indeks yalnızca anahtar tekilliği için yedek olarak eklenir.
              <li
                key={`${d.uuid}-${i}`}
                className="flex justify-between border-t border-neutral-100 py-2"
              >
                <span>{d.status}</span>
                <span className="text-neutral-500">
                  {d.createdAt ? new Date(d.createdAt).toLocaleString("tr-TR") : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ResultSection>

      <ResultSection
        baslik="Ortam değişkeni anahtarları"
        result={envKeys}
        bos="Tanımlı ortam değişkeni yok."
      >
        {(items) => (
          <ul className="flex flex-wrap gap-2 text-sm">
            {items.map((e) => (
              <li key={`${e.key}-${e.isPreview ? "preview" : "main"}`} className="rounded border border-neutral-200 px-2 py-1 font-mono text-xs">
                {e.key}
                {e.isBuildTime ? " · build" : ""}
                {e.isPreview ? " · preview" : ""}
              </li>
            ))}
          </ul>
        )}
      </ResultSection>

      <ResultSection baslik="Log kuyruğu" result={logs} bos="Log bulunamadı.">
        {(items) => (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-neutral-950 p-3 text-xs text-neutral-100">
            {items.join("\n")}
          </pre>
        )}
      </ResultSection>
    </main>
  );
}
