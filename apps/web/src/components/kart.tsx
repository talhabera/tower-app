import type { ReactNode } from "react";

export type Tazelik = "taze" | "bayat" | "ulasilamiyor";

const NOT: Record<Tazelik, string> = {
  taze: "",
  bayat: "bayat veri",
  ulasilamiyor: "ulaşılamıyor",
};

export function Kart({
  baslik,
  tazelik = "taze",
  zaman,
  children,
}: {
  baslik: string;
  tazelik?: Tazelik;
  zaman?: string | null;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-900">{baslik}</h2>
        {tazelik !== "taze" && (
          <span className="text-xs text-amber-700">
            {NOT[tazelik]}
            {zaman ? ` · son okuma ${new Date(zaman).toLocaleString("tr-TR")}` : ""}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}
