import { Kart } from "@/components/kart";
import { auditDisplayStatus } from "@/server/audit-view";
import { requireSession } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const ETIKET = { ok: "tamam", failed: "başarısız", pending: "sürüyor", interrupted: "yarıda kaldı" } as const;
const RENK = { ok: "text-emerald-700", failed: "text-red-700", pending: "text-neutral-600", interrupted: "text-amber-700" } as const;

export default async function Denetim() {
  await requireSession();
  const store = getStore();
  if (!store) {
    return (
      <main className="p-8">
        <Kart baslik="Denetim kaydı" tazelik="ulasilamiyor">
          <p className="text-sm">DATABASE_URL tanımlı değil.</p>
        </Kart>
      </main>
    );
  }
  let rows;
  try {
    rows = await store.listAudit(200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
    return (
      <main className="p-8">
        <Kart baslik="Denetim kaydı" tazelik="ulasilamiyor">
          <p className="text-sm">Denetim kaydı okunamadı: {msg}</p>
        </Kart>
      </main>
    );
  }
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Denetim kaydı</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Henüz yazma işlemi yok.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-neutral-500">
            <tr>
              <th className="py-1">Zaman</th>
              <th>Kim</th>
              <th>İşlem</th>
              <th>Hedef</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = auditDisplayStatus(r, now);
              return (
                <tr key={r.id} className={`border-t border-neutral-100 ${r.parentId ? "text-neutral-600" : ""}`}>
                  <td className="py-1">{r.createdAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</td>
                  <td>{r.actorEmail}</td>
                  <td>{r.parentId ? `↳ ${r.action}` : r.action}</td>
                  <td className="font-mono text-xs">{r.target ?? "—"}</td>
                  <td className={RENK[d]}>
                    {ETIKET[d]}
                    {r.errorKind ? ` (${r.errorKind})` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
