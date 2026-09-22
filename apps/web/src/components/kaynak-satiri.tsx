import Link from "next/link";
import type { FleetResource } from "@tower/coolify";
import { DurumRozeti } from "./durum-rozeti";

export function KaynakSatiri({ kaynak }: { kaynak: FleetResource }) {
  const isApp = kaynak.kind === "application";
  return (
    <li className="flex items-center gap-3 border-t border-neutral-100 py-2 text-sm">
      {isApp ? (
        <Link href={`/filo/${kaynak.uuid}`} className="min-w-0 flex-1 truncate hover:underline">
          {kaynak.name}
        </Link>
      ) : (
        <span className="min-w-0 flex-1 truncate">{kaynak.name}</span>
      )}
      <span className="shrink-0 text-xs text-neutral-500">{kaynak.kind}</span>
      <DurumRozeti status={kaynak.status} />
    </li>
  );
}
