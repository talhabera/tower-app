import Link from "next/link";

export default function GirisHatasiPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg text-zinc-900 dark:text-zinc-50">Giriş başarısız oldu.</p>
      <Link href="/api/auth/login" className="font-medium underline">
        Tekrar dene
      </Link>
    </div>
  );
}
