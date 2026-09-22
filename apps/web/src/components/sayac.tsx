import Link from "next/link";

/**
 * Risk sayacı. `sayi === null` → kaynağı okunamadı: "?" ve "ulaşılamıyor"
 * gösterilir, asla 0 (sessiz "her şey yolunda") gösterilmez.
 */
export function Sayac({
  baslik,
  sayi,
  href,
  aciklama,
}: {
  baslik: string;
  sayi: number | null;
  href: string;
  aciklama: string;
}) {
  const bilinmiyor = sayi === null;
  const tehlike = !bilinmiyor && sayi > 0;
  const kutu = bilinmiyor
    ? "border-amber-300 bg-amber-50 hover:bg-amber-100"
    : tehlike
      ? "border-red-300 bg-red-50 hover:bg-red-100"
      : "border-neutral-200 bg-white hover:bg-neutral-50";
  const rakam = bilinmiyor ? "text-amber-700" : tehlike ? "text-red-700" : "text-neutral-400";
  return (
    <Link href={href} className={`block rounded-lg border p-4 transition ${kutu}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-3xl font-semibold ${rakam}`}>{bilinmiyor ? "?" : sayi}</span>
        {bilinmiyor && <span className="text-xs text-amber-700">ulaşılamıyor</span>}
      </div>
      <div className="mt-1 text-sm font-medium text-neutral-900">{baslik}</div>
      <p className="mt-1 text-xs text-neutral-600">{aciklama}</p>
    </Link>
  );
}
