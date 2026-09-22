/**
 * Spec: 401 → tüm sayfa tek "token geçersiz" bandı. Tüm Coolify okuyan
 * sayfalar (/, /filo, /filo/[uuid], /yedekleme) bunu kullanır.
 */
export function TokenGecersizBandi() {
  return (
    <main className="p-8">
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
        Coolify token&apos;ı geçersiz. <code>.env.local</code> içindeki <code>COOLIFY_TOKEN</code>{" "}
        yenilenmeli.
      </div>
    </main>
  );
}
