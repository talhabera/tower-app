import Link from "next/link";

const MESAJ: Record<string, string> = {
  cikis: "Çıkış yapıldı.",
  yetkisiz: "Bu hesabın Tower'a erişim izni yok.",
};

/** Herkese açık sayfa (proxy.ts allowlist): giriş hatası ve çıkış sonrası iniş. */
export default async function GirisHatasiPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string }>;
}) {
  const { durum } = await searchParams;
  const mesaj = (durum && MESAJ[durum]) || "Giriş başarısız oldu.";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg text-zinc-900 dark:text-zinc-50">{mesaj}</p>
      <Link href="/api/auth/login" className="font-medium underline">
        {durum === "cikis" ? "Tekrar giriş yap" : "Tekrar dene"}
      </Link>
    </div>
  );
}
