import "server-only";
import { createStore, type TowerStore } from "@tower/db";

let cached: TowerStore | null | undefined;

/** DATABASE_URL yoksa null: yazma yolları `db` hatası döner, okuma sayfaları etkilenmez. */
export function getStore(): TowerStore | null {
  if (cached === undefined) {
    const url = process.env.DATABASE_URL?.trim();
    cached = url ? createStore(url) : null;
  }
  return cached;
}
