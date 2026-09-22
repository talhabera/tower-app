"use client";

/**
 * Yedekleme bölümü için son çare hata sınırı. `resolveInput`/sayfa okumaları
 * kendi try/catch'lerini kaçırırsa (beklenmeyen bir throw) pano tamamen
 * boşalmaz — bu ekran çıkar.
 */
export default function YedeklemeHata({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="space-y-4 p-8">
      <p className="text-sm text-red-700">
        Beklenmeyen bir hata oluştu; Tower veritabanına ulaşılamıyor olabilir.
      </p>
      <button type="button" onClick={() => reset()} className="rounded border px-3 py-1 text-sm">
        Tekrar dene
      </button>
    </main>
  );
}
