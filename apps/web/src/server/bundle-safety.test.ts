import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** İstemci bileşenlerinde sunucu gizli bilgilerinin adı dahi geçmemeli. */
const FORBIDDEN = ["COOLIFY_TOKEN", "TOWER_OIDC_CLIENT_SECRET", "TOWER_SESSION_SECRET"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".tsx") || full.endsWith(".ts") ? [full] : [];
  });
}

describe("istemci paketi güvenliği", () => {
  it('"use client" dosyaları sunucu gizli bilgilerine dokunmaz', () => {
    const offenders: string[] = [];

    for (const file of walk(path.join(import.meta.dirname, "..", "app"))) {
      const source = readFileSync(file, "utf8");
      if (!/^\s*["']use client["']/.test(source)) continue;
      for (const name of FORBIDDEN) {
        if (source.includes(name)) offenders.push(`${file} -> ${name}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
