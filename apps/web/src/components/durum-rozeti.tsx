import type { ResourceStatus } from "@tower/coolify";

const ETIKET: Record<string, string> = {
  "running:healthy": "çalışıyor · sağlıklı",
  "running:unknown": "çalışıyor · healthcheck yok",
  "running:unhealthy": "çalışıyor · sağlıksız",
  "exited:unhealthy": "durdu",
  "exited:unknown": "durdu",
};

function renk(status: ResourceStatus): string {
  if (status.state !== "running") return "bg-red-100 text-red-900 ring-red-300";
  if (status.health === "healthy") return "bg-emerald-100 text-emerald-900 ring-emerald-300";
  if (status.health === "unhealthy") return "bg-red-100 text-red-900 ring-red-300";
  // running:unknown yeşil DEĞİL — healthcheck tanımsız demek.
  return "bg-amber-100 text-amber-900 ring-amber-300";
}

export function DurumRozeti({ status }: { status: ResourceStatus }) {
  const etiket = ETIKET[status.raw] ?? (status.raw || "bilinmiyor");
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ${renk(status)}`}>
      {etiket}
    </span>
  );
}
