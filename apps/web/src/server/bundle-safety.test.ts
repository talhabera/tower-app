import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** İstemci bileşenlerinde sunucu gizli bilgilerinin adı dahi geçmemeli. */
const FORBIDDEN_NAMES = ["COOLIFY_TOKEN", "TOWER_OIDC_CLIENT_SECRET", "TOWER_SESSION_SECRET"];

/** İstemci bileşeni bu modülleri içe aktaramaz (token/oturum sunucu tarafında kalır). */
const FORBIDDEN_IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)["'](@tower\/coolify|@\/server\/[^"']*|server-only)["']/g;

const USE_CLIENT = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/;

const SRC = path.join(import.meta.dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    if (/\.test\.tsx?$/.test(full)) return [];
    return full.endsWith(".tsx") || full.endsWith(".ts") ? [full] : [];
  });
}

/** Bir kaynak dosyadaki istemci paketi ihlallerini döner ("use client" değilse boş). */
export function clientViolations(file: string, source: string): string[] {
  if (!USE_CLIENT.test(source)) return [];
  const out: string[] = [];
  for (const name of FORBIDDEN_NAMES) {
    if (source.includes(name)) out.push(`${file} -> ${name}`);
  }
  for (const m of source.matchAll(FORBIDDEN_IMPORT)) {
    out.push(`${file} -> import ${m[1]}`);
  }
  return out;
}

describe("istemci paketi güvenliği", () => {
  it("denetleyici sahte bir istemci dosyasındaki ihlalleri yakalar", () => {
    const fake = [
      "// açıklama",
      '"use client";',
      'import { loadFleet } from "@tower/coolify";',
      'import { requireSession } from "@/server/session";',
      "const t = process.env.COOLIFY_TOKEN;",
    ].join("\n");

    expect(clientViolations("fake.tsx", fake)).toEqual([
      "fake.tsx -> COOLIFY_TOKEN",
      "fake.tsx -> import @tower/coolify",
      "fake.tsx -> import @/server/session",
    ]);
  });

  it('denetleyici "use client" olmayan dosyaları ve temiz istemci dosyalarını geçirir', () => {
    expect(clientViolations("server.ts", 'import { x } from "@tower/coolify";')).toEqual([]);
    expect(clientViolations("ok.tsx", '"use client";\nimport Link from "next/link";')).toEqual([]);
  });

  it('src/ altındaki "use client" dosyaları sunucu gizli bilgilerine ve sunucu modüllerine dokunmaz', () => {
    const files = walk(SRC);
    // Tarama boş kalırsa test anlamsızlaşır: gerçekten dosya tarandığını doğrula.
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.includes(`${path.sep}components${path.sep}`))).toBe(true);

    const offenders = files.flatMap((file) => clientViolations(file, readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
