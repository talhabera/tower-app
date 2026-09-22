# Tower Faz 1 — Coolify Kontrol Odası: Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coolify instance'ındaki tüm kaynakları salt-okunur gösteren, dört sessiz altyapı riskini ilk ekranda sayan bir kontrol odası.

**Architecture:** `@tower/coolify` paketi yalnızca okuma metodları export eder (yazma tip seviyesinde imkânsız). `apps/web` Next.js 16 App Router; tüm Coolify çağrıları Server Component içinde, token asla istemciye gitmez. Durum yok — veritabanı yok, oturum şifreli çerezde.

**Tech Stack:** pnpm 11.3.0 workspace + turborepo, Next.js 16.3.5, React 19.2.8, TypeScript 5 strict, Tailwind v4, vitest, openid-client v6, jose.

**Spec:** `docs/superpowers/specs/2026-09-19-tower-coolify-control-room-design.md`

## Global Constraints

- Node 26, pnpm 11.3.0. Kurulum **her zaman repo kökünden** (`apps/web` içinde `pnpm install` çalıştırmak `pnpm-workspace.yaml` gölgeler ve build'i kırar).
- `@tower/coolify` paketinden **hiçbir yazma metodu export edilmez**: POST/PATCH/DELETE/PUT çağrısı yapan kod bu pakette bulunmaz.
- `COOLIFY_TOKEN`, `COOLIFY_URL`, OIDC gizli bilgileri **asla** `NEXT_PUBLIC_` önekli değişkene taşınmaz ve istemci bileşenine prop olarak geçmez.
- Env **değerleri** hiçbir ekranda gösterilmez; yalnızca anahtar adları.
- Her kaynak okuma metodu `Result<T>` döner, throw etmez.
- Yeşil tanımı: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (repo kökünden) — dördü de sıfır çıkış kodu.
- Tarihler mutlak yazılır, göreli değil.
- Arayüz metni Türkçe.

## Ön koşul (insan yapar, kodlama değil)

- [ ] `.env.local` düzeltmesi: `COOLIFY_TOKEN=` sonrasındaki **boşluk silinir**, satır `KEY=value` biçimine gelir.
- [ ] Coolify token'ı döndürülür (eski token 2026-09-19'da oturum kaydına düştü).
- [ ] NexAuth'ta Tower için OIDC client kaydı açılır; `TOWER_OIDC_CLIENT_ID` ve `TOWER_OIDC_CLIENT_SECRET` `.env.local`'a eklenir. Redirect URI: `http://localhost:3000/api/auth/callback`.
- [ ] `TOWER_SESSION_SECRET` üretilir: `openssl rand -base64 32`.

---

### Task 1: `@tower/coolify` paket iskeleti + Result/hata taksonomisi

**Files:**
- Create: `packages/coolify/package.json`
- Create: `packages/coolify/tsconfig.json`
- Create: `packages/coolify/vitest.config.ts`
- Create: `packages/coolify/src/result.ts`
- Create: `packages/coolify/src/index.ts`
- Test: `packages/coolify/src/result.test.ts`
- Modify: `package.json` (kök — `vitest` devDependency)

**Interfaces:**
- Consumes: yok (ilk task).
- Produces: `Result<T>`, `CoolifyError`, `CoolifyErrorKind`, `ok(value)`, `err(kind, message, status?)`, `isOk(r)`.

- [ ] **Step 1: Paket dosyalarını oluştur**

`packages/coolify/package.json`:

```json
{
  "name": "@tower/coolify",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

`packages/coolify/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts"]
}
```

`packages/coolify/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { globals: true, environment: "node" },
});
```

- [ ] **Step 2: Testi yaz (başarısız olacak)**

`packages/coolify/src/result.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { err, isOk, ok } from "./result";

describe("Result", () => {
  it("ok değeri taşır", () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it("err türü ve mesajı taşır", () => {
    const r = err("unauthorized", "token geçersiz", 401);
    expect(isOk(r)).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("unauthorized");
      expect(r.error.status).toBe(401);
      expect(r.error.message).toBe("token geçersiz");
    }
  });
});
```

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu gör**

Kök dizinden: `pnpm --filter @tower/coolify test`
Beklenen: FAIL — `Failed to resolve import "./result"`.

- [ ] **Step 4: Minimal uygulamayı yaz**

`packages/coolify/src/result.ts`:

```ts
export type CoolifyErrorKind =
  | "unreachable"
  | "unauthorized"
  | "rate_limited"
  | "not_found"
  | "malformed";

export type CoolifyError = {
  kind: CoolifyErrorKind;
  message: string;
  status?: number;
};

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: CoolifyError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(
  kind: CoolifyErrorKind,
  message: string,
  status?: number,
): Result<T> {
  return { ok: false, error: { kind, message, status } };
}

export function isOk<T>(r: Result<T>): r is { ok: true; value: T } {
  return r.ok;
}
```

`packages/coolify/src/index.ts`:

```ts
export type { CoolifyError, CoolifyErrorKind, Result } from "./result";
export { err, isOk, ok } from "./result";
```

- [ ] **Step 5: Kök `package.json`'a vitest ekle ve kur**

Kök `package.json` içindeki `devDependencies` bloğuna `"vitest": "^3"` satırını ekle, sonra **repo kökünden**:

```bash
pnpm install
```

- [ ] **Step 6: Testleri çalıştır, geçtiğini gör**

```bash
pnpm --filter @tower/coolify test
pnpm typecheck && pnpm lint
```
Beklenen: test PASS, typecheck ve lint sıfır hata.

- [ ] **Step 7: Commit**

```bash
git add packages/coolify package.json pnpm-lock.yaml
git commit -m "feat(coolify): add package scaffold with Result error taxonomy"
```

---

### Task 2: Gizli bilgi maskeleme

Bu birim hem log render'ında hem fixture kaydında kullanılır. Güvenlik açısından kritik olduğu için kendi test döngüsünü hak eder.

**Files:**
- Create: `packages/coolify/src/mask.ts`
- Test: `packages/coolify/src/mask.test.ts`
- Modify: `packages/coolify/src/index.ts`

**Interfaces:**
- Consumes: yok.
- Produces: `maskSecrets(text: string): string`.

- [ ] **Step 1: Testi yaz**

`packages/coolify/src/mask.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { maskSecrets } from "./mask";

describe("maskSecrets", () => {
  it("KEY=value biçimindeki gizli anahtarları maskeler", () => {
    const out = maskSecrets("COOLIFY_TOKEN=abc123def456ghi789jkl012mno345");
    expect(out).toBe("COOLIFY_TOKEN=***");
    expect(out).not.toContain("abc123");
  });

  it("SECRET ve PASSWORD anahtarlarını da maskeler", () => {
    expect(maskSecrets("APP_SECRET=s3cr3tvalue")).toBe("APP_SECRET=***");
    expect(maskSecrets("DB_PASSWORD=hunter2")).toBe("DB_PASSWORD=***");
  });

  it("veritabanı bağlantı dizesindeki parolayı maskeler", () => {
    expect(maskSecrets("postgres://user:pw123@host:5432/db")).toBe(
      "postgres://user:***@host:5432/db",
    );
  });

  it("Bearer token'ı maskeler", () => {
    expect(maskSecrets("Authorization: Bearer aaaabbbbccccddddeeeeffff")).toBe(
      "Authorization: Bearer ***",
    );
  });

  it("uzun serbest base64/hex dizilerini maskeler", () => {
    expect(maskSecrets("deploy id 4f8a9b2c1d3e5f6a7b8c9d0e1f2a3b4c5d6e7f80")).toContain("***");
  });

  it("normal metni bozmaz", () => {
    const text = "2026-09-20 build başarılı, 12 kaynak tarandı";
    expect(maskSecrets(text)).toBe(text);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `pnpm --filter @tower/coolify test mask`
Beklenen: FAIL — `Failed to resolve import "./mask"`.

- [ ] **Step 3: Uygulamayı yaz**

`packages/coolify/src/mask.ts`:

```ts
const RULES: Array<[RegExp, string]> = [
  // KEY=value — anahtar adı gizli bilgi ima ediyorsa
  [/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|PRIVATE_KEY))=\S+/g, "$1=***"],
  // Bağlantı dizesindeki parola
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1***@"],
  // Authorization: Bearer xxx
  [/\b(Bearer)\s+[A-Za-z0-9._~+/-]{12,}=*/g, "$1 ***"],
  // Serbest dolaşan uzun sır benzeri diziler
  [/\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g, "***"],
];

/**
 * Metindeki gizli bilgi benzeri desenleri maskeler.
 * Log render'ı ve fixture kaydı öncesi ZORUNLU olarak uygulanır.
 */
export function maskSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RULES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
```

`packages/coolify/src/index.ts` dosyasına ekle:

```ts
export { maskSecrets } from "./mask";
```

- [ ] **Step 4: Testleri çalıştır, geçtiğini gör**

Run: `pnpm --filter @tower/coolify test`
Beklenen: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/coolify/src
git commit -m "feat(coolify): add secret masking for logs and fixtures"
```

---

### Task 3: HTTP okuma istemcisi

**Files:**
- Create: `packages/coolify/src/config.ts`
- Create: `packages/coolify/src/http.ts`
- Test: `packages/coolify/src/http.test.ts`
- Modify: `packages/coolify/src/index.ts`

**Interfaces:**
- Consumes: `Result`, `err`, `ok` (Task 1).
- Produces: `readConfig(env: NodeJS.ProcessEnv): Result<CoolifyConfig>`, `CoolifyConfig = { baseUrl: string; token: string }`, `createClient(config, fetchImpl?): CoolifyHttp`, `CoolifyHttp = { get<T>(path: string): Promise<Result<T>> }`.

- [ ] **Step 1: Testi yaz**

`packages/coolify/src/http.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { readConfig } from "./config";
import { createClient } from "./http";

const config = { baseUrl: "https://panel.example.app", token: "t0ken" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("readConfig", () => {
  it("eksik COOLIFY_URL'i hata olarak döner", () => {
    const r = readConfig({ COOLIFY_TOKEN: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("malformed");
  });

  it("sondaki eğik çizgiyi temizler", () => {
    const r = readConfig({ COOLIFY_URL: "https://a.app/", COOLIFY_TOKEN: "x" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.baseUrl).toBe("https://a.app");
  });
});

describe("createClient.get", () => {
  it("/api/v1 önekini ve Bearer başlığını ekler", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ uuid: "a" }]));
    const client = createClient(config, fetchImpl);

    await client.get("/servers");

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://panel.example.app/api/v1/servers");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t0ken");
  });

  it("401'i unauthorized'a çevirir", async () => {
    const client = createClient(config, async () => jsonResponse({}, 401));
    const r = await client.get("/servers");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("unauthorized");
  });

  it("404'ü not_found'a çevirir", async () => {
    const client = createClient(config, async () => jsonResponse({}, 404));
    const r = await client.get("/servers/yok");
    if (!r.ok) expect(r.error.kind).toBe("not_found");
  });

  it("429'u rate_limited'a çevirir", async () => {
    const client = createClient(config, async () => jsonResponse({}, 429));
    const r = await client.get("/servers");
    if (!r.ok) expect(r.error.kind).toBe("rate_limited");
  });

  it("ağ hatasını unreachable'a çevirir", async () => {
    const client = createClient(config, async () => {
      throw new TypeError("fetch failed");
    });
    const r = await client.get("/servers");
    if (!r.ok) expect(r.error.kind).toBe("unreachable");
  });

  it("JSON olmayan gövdeyi malformed'a çevirir", async () => {
    const client = createClient(config, async () => new Response("<html>", { status: 200 }));
    const r = await client.get("/servers");
    if (!r.ok) expect(r.error.kind).toBe("malformed");
  });

  it("hata mesajında token sızdırmaz", async () => {
    const client = createClient(config, async () => jsonResponse({}, 401));
    const r = await client.get("/servers");
    if (!r.ok) expect(JSON.stringify(r.error)).not.toContain("t0ken");
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `pnpm --filter @tower/coolify test http`
Beklenen: FAIL — `./config` ve `./http` çözümlenemiyor.

- [ ] **Step 3: Uygulamayı yaz**

`packages/coolify/src/config.ts`:

```ts
import { err, ok, type Result } from "./result";

export type CoolifyConfig = {
  baseUrl: string;
  token: string;
};

export function readConfig(env: Record<string, string | undefined>): Result<CoolifyConfig> {
  const rawUrl = env.COOLIFY_URL?.trim();
  const token = env.COOLIFY_TOKEN?.trim();

  if (!rawUrl) return err("malformed", "COOLIFY_URL tanımlı değil");
  if (!token) return err("malformed", "COOLIFY_TOKEN tanımlı değil");

  return ok({ baseUrl: rawUrl.replace(/\/+$/, ""), token });
}
```

`packages/coolify/src/http.ts`:

```ts
import type { CoolifyConfig } from "./config";
import { err, ok, type Result } from "./result";

const TIMEOUT_MS = 20_000;

export type CoolifyHttp = {
  get<T>(path: string): Promise<Result<T>>;
};

export function createClient(
  config: CoolifyConfig,
  fetchImpl: typeof fetch = fetch,
): CoolifyHttp {
  return {
    async get<T>(path: string): Promise<Result<T>> {
      const url = `${config.baseUrl}/api/v1${path}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        });
      } catch {
        // Hata nesnesi taşınmaz: token içeren istek bağlamı sızabilir.
        return err("unreachable", `Coolify'a ulaşılamadı: ${path}`);
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 401 || response.status === 403) {
        return err("unauthorized", "Coolify token'ı reddedildi", response.status);
      }
      if (response.status === 404) {
        return err("not_found", `Kaynak bulunamadı: ${path}`, 404);
      }
      if (response.status === 429) {
        return err("rate_limited", "Coolify istek sınırı aşıldı", 429);
      }
      if (!response.ok) {
        return err("malformed", `Beklenmeyen durum kodu: ${response.status}`, response.status);
      }

      try {
        return ok((await response.json()) as T);
      } catch {
        return err("malformed", `Cevap JSON değil: ${path}`);
      }
    },
  };
}
```

`packages/coolify/src/index.ts` dosyasına ekle:

```ts
export type { CoolifyConfig } from "./config";
export { readConfig } from "./config";
export type { CoolifyHttp } from "./http";
export { createClient } from "./http";
```

- [ ] **Step 4: Testleri çalıştır, geçtiğini gör**

Run: `pnpm --filter @tower/coolify test`
Beklenen: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/coolify/src
git commit -m "feat(coolify): add read-only HTTP client with error taxonomy"
```

---

### Task 4: Alan tipleri ve durum ayrıştırma

Coolify uygulama nesnesi 96 alan taşır. Arayüzün ihtiyacı olan dar görünüm tipleri elle tanımlanır; ham cevap doğrudan render'a geçmez.

**Files:**
- Create: `packages/coolify/src/types.ts`
- Create: `packages/coolify/src/status.ts`
- Test: `packages/coolify/src/status.test.ts`
- Modify: `packages/coolify/src/index.ts`

**Interfaces:**
- Consumes: yok.
- Produces: `ResourceKind`, `ResourceStatus`, `parseStatus(raw: string | null | undefined): ResourceStatus`, `FleetServer`, `FleetProject`, `FleetEnvironment`, `FleetResource`, `DatabaseBackup`, `S3Storage`, `ApplicationDetail`, `RESOURCE_BUCKETS`.

- [ ] **Step 1: Testi yaz**

`packages/coolify/src/status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStatus } from "./status";

describe("parseStatus", () => {
  it("running:healthy ayrıştırır", () => {
    expect(parseStatus("running:healthy")).toEqual({
      raw: "running:healthy",
      state: "running",
      health: "healthy",
    });
  });

  it("exited:unhealthy ayrıştırır", () => {
    expect(parseStatus("exited:unhealthy")).toEqual({
      raw: "exited:unhealthy",
      state: "exited",
      health: "unhealthy",
    });
  });

  it("running:unknown'ı sağlıklı SAYMAZ", () => {
    const s = parseStatus("running:unknown");
    expect(s.state).toBe("running");
    expect(s.health).toBe("unknown");
  });

  it("sağlık eki olmayan durumu unknown sağlık ile döner", () => {
    expect(parseStatus("running")).toEqual({
      raw: "running",
      state: "running",
      health: "unknown",
    });
  });

  it("boş girdiyi unknown/unknown yapar", () => {
    expect(parseStatus(null)).toEqual({ raw: "", state: "unknown", health: "unknown" });
    expect(parseStatus(undefined).state).toBe("unknown");
  });

  it("tanınmayan durumu unknown'a düşürür", () => {
    expect(parseStatus("zıplıyor:healthy").state).toBe("unknown");
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `pnpm --filter @tower/coolify test status`
Beklenen: FAIL — `./status` çözümlenemiyor.

- [ ] **Step 3: Uygulamayı yaz**

`packages/coolify/src/status.ts`:

```ts
export type ResourceState = "running" | "exited" | "restarting" | "degraded" | "unknown";
export type ResourceHealth = "healthy" | "unhealthy" | "unknown";

export type ResourceStatus = {
  raw: string;
  state: ResourceState;
  health: ResourceHealth;
};

const STATES: ResourceState[] = ["running", "exited", "restarting", "degraded"];
const HEALTHS: ResourceHealth[] = ["healthy", "unhealthy"];

/**
 * Coolify "running:healthy" biçiminde durum döner.
 * "running:unknown" yaygındır ve healthcheck tanımsız demektir — yeşil DEĞİLDİR.
 */
export function parseStatus(raw: string | null | undefined): ResourceStatus {
  const text = (raw ?? "").trim();
  const [statePart = "", healthPart = ""] = text.split(":");

  const state = STATES.find((s) => s === statePart) ?? "unknown";
  const health = HEALTHS.find((h) => h === healthPart) ?? "unknown";

  return { raw: text, state, health };
}
```

`packages/coolify/src/types.ts`:

```ts
import type { ResourceStatus } from "./status";

export type ResourceKind =
  | "application"
  | "service"
  | "postgresql"
  | "mysql"
  | "mariadb"
  | "mongodb"
  | "redis"
  | "keydb"
  | "dragonfly"
  | "clickhouse";

/**
 * Coolify environment cevabı kaynakları türe göre ayrı dizilerde döner.
 * Anahtar -> ResourceKind eşlemesi.
 */
export const RESOURCE_BUCKETS: Record<string, ResourceKind> = {
  applications: "application",
  services: "service",
  postgresqls: "postgresql",
  mysqls: "mysql",
  mariadbs: "mariadb",
  mongodbs: "mongodb",
  redis: "redis",
  keydbs: "keydb",
  dragonflies: "dragonfly",
  clickhouses: "clickhouse",
};

export type FleetServer = {
  uuid: string;
  name: string;
  reachable: boolean;
  usable: boolean;
};

export type FleetResource = {
  uuid: string;
  name: string;
  kind: ResourceKind;
  status: ResourceStatus;
  projectUuid: string;
  projectName: string;
  environmentName: string;
};

export type FleetEnvironment = {
  uuid: string;
  name: string;
  resources: FleetResource[];
};

export type FleetProject = {
  uuid: string;
  name: string;
  environments: FleetEnvironment[];
  /** Bu projenin okunmasında hata oluştuysa dolu gelir; ağaç yine de render edilir. */
  failure?: string;
};

export type DatabaseBackup = {
  uuid: string;
  enabled: boolean;
  frequency: string;
  saveToS3: boolean;
};

export type DatabaseSummary = {
  uuid: string;
  name: string;
  status: ResourceStatus;
  backups: DatabaseBackup[];
};

export type S3Storage = {
  uuid: string;
  name: string;
  bucket: string;
  endpoint: string;
  usable: boolean;
};

export type EnvKey = {
  key: string;
  isBuildTime: boolean;
};

export type ApplicationDetail = {
  uuid: string;
  name: string;
  description: string;
  buildPack: string;
  gitRepository: string;
  gitBranch: string;
  /** Coolify tek alanda virgülle ayırır; burada liste olarak tutulur. */
  domains: string[];
  portsExposed: string;
  healthCheckEnabled: boolean;
  healthCheckPath: string;
  limitsMemory: string;
  limitsCpus: string;
  status: ResourceStatus;
};

export type DeploymentSummary = {
  uuid: string;
  applicationName: string;
  status: string;
  createdAt: string;
};
```

`packages/coolify/src/index.ts` dosyasına ekle:

```ts
export * from "./types";
export type { ResourceHealth, ResourceState, ResourceStatus } from "./status";
export { parseStatus } from "./status";
```

- [ ] **Step 4: Testleri çalıştır, geçtiğini gör**

Run: `pnpm --filter @tower/coolify test && pnpm --filter @tower/coolify typecheck`
Beklenen: PASS, typecheck temiz.

- [ ] **Step 5: Commit**

```bash
git add packages/coolify/src
git commit -m "feat(coolify): add domain view types and status parsing"
```

---

### Task 5: Fixture kaydedici betik

Testler canlı instance'a bağlanmaz. Bu betik bir kez çalışır, cevapları **maskeleyerek** diske yazar.

**Files:**
- Create: `packages/coolify/scripts/record-fixtures.ts`
- Create: `packages/coolify/src/fixtures/.gitkeep`
- Modify: `packages/coolify/package.json` (`record:fixtures` scripti, `tsx` devDependency)

**Interfaces:**
- Consumes: `readConfig`, `createClient` (Task 3), `maskSecrets` (Task 2).
- Produces: `packages/coolify/src/fixtures/*.json` — `servers.json`, `projects.json`, `environments-<projectUuid>.json`, `environment-detail.json`, `databases.json`, `s3-storages.json`, `application-detail.json`, `deployments.json`.

- [ ] **Step 1: Betiği yaz**

`packages/coolify/scripts/record-fixtures.ts`:

```ts
/**
 * Canlı Coolify instance'ından fixture kaydeder.
 * Yazmadan önce TÜM gövde maskeSecrets'tan geçer — ham cevap repoya girmez.
 * Kullanım (repo kökünden): pnpm --filter @tower/coolify record:fixtures
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "../src/http";
import { readConfig } from "../src/config";
import { maskSecrets } from "../src/mask";

const OUT_DIR = path.join(import.meta.dirname, "..", "src", "fixtures");

async function save(client: ReturnType<typeof createClient>, name: string, apiPath: string) {
  const result = await client.get<unknown>(apiPath);
  if (!result.ok) {
    console.error(`atlandı ${name}: ${result.error.kind} — ${result.error.message}`);
    return null;
  }
  const masked = JSON.parse(maskSecrets(JSON.stringify(result.value, null, 2)));
  writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(masked, null, 2));
  console.log(`yazıldı ${name}.json`);
  return masked;
}

async function main() {
  const config = readConfig(process.env);
  if (!config.ok) {
    console.error(config.error.message);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const client = createClient(config.value);

  await save(client, "servers", "/servers");
  await save(client, "databases", "/databases");
  await save(client, "s3-storages", "/s3-storages");
  await save(client, "deployments", "/deployments");

  const projects = (await save(client, "projects", "/projects")) as
    | Array<{ uuid: string; name: string }>
    | null;
  if (!projects?.length) return;

  const first = projects[0];
  const envs = (await save(
    client,
    `environments-${first.uuid}`,
    `/projects/${first.uuid}/environments`,
  )) as Array<{ name: string }> | null;

  if (envs?.length) {
    const detail = (await save(
      client,
      "environment-detail",
      `/projects/${first.uuid}/${envs[0].name}`,
    )) as { applications?: Array<{ uuid: string }> } | null;

    const app = detail?.applications?.[0];
    if (app) await save(client, "application-detail", `/applications/${app.uuid}`);
  }
}

main();
```

- [ ] **Step 2: Paket scriptini ve bağımlılığı ekle**

`packages/coolify/package.json` içine:

```json
"record:fixtures": "node --env-file=../../.env.local scripts/record-fixtures.ts"
```

- [ ] **Step 3: Betiği çalıştır**

**Ön koşul:** `.env.local` düzeltilmiş ve token döndürülmüş olmalı.

```bash
pnpm --filter @tower/coolify record:fixtures
```
Beklenen: `src/fixtures/` altında en az `servers.json`, `projects.json`, `environment-detail.json`, `databases.json` dosyaları.

- [ ] **Step 4: Maskelemeyi elle doğrula**

```bash
grep -riE "bearer [a-z0-9]{12,}|_token=|_secret=|postgres://[^:]+:[^*]" packages/coolify/src/fixtures/ || echo "TEMIZ"
```
Beklenen: `TEMIZ`. Aksi halde `maskSecrets` kuralı eksiktir — Task 2'ye dön, kuralı ve testini ekle, fixture'ları yeniden kaydet.

- [ ] **Step 5: Commit**

```bash
git add packages/coolify/scripts packages/coolify/src/fixtures packages/coolify/package.json
git commit -m "feat(coolify): add fixture recorder with mandatory masking"
```

---

### Task 6: Okuma metodları

**Files:**
- Create: `packages/coolify/src/api.ts`
- Test: `packages/coolify/src/api.test.ts`
- Modify: `packages/coolify/src/index.ts`

**Interfaces:**
- Consumes: `CoolifyHttp` (Task 3), tüm tipler (Task 4).
- Produces: `listServers(http)`, `listProjects(http)`, `listEnvironments(http, projectUuid)`, `getEnvironment(http, projectUuid, environmentName)`, `listDatabases(http)`, `getDatabaseBackups(http, databaseUuid)`, `listS3Storages(http)`, `getApplication(http, uuid)`, `listDeployments(http)` — hepsi `Promise<Result<...>>`.

- [ ] **Step 1: Testi yaz**

`packages/coolify/src/api.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import environmentDetail from "./fixtures/environment-detail.json";
import servers from "./fixtures/servers.json";
import { getEnvironment, listServers } from "./api";
import type { CoolifyHttp } from "./http";
import { ok } from "./result";

function stubHttp(payload: unknown): CoolifyHttp {
  return { get: async <T>() => ok(payload as T) };
}

describe("listServers", () => {
  it("sunucuları erişilebilirlik bayraklarıyla eşler", async () => {
    const r = await listServers(stubHttp(servers));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBeGreaterThan(0);
    const s = r.value[0];
    expect(typeof s.uuid).toBe("string");
    expect(typeof s.name).toBe("string");
    expect(typeof s.reachable).toBe("boolean");
    expect(typeof s.usable).toBe("boolean");
  });
});

describe("getEnvironment", () => {
  it("tüm tür kovalarını tek kaynak listesine düzleştirir", async () => {
    const r = await getEnvironment(stubHttp(environmentDetail), "proj-uuid", "production");
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const kinds = new Set(r.value.resources.map((x) => x.kind));
    expect(kinds.has("application")).toBe(true);
    for (const res of r.value.resources) {
      expect(res.projectUuid).toBe("proj-uuid");
      expect(res.environmentName).toBe(r.value.name);
      expect(res.status.state).toBeDefined();
    }
  });

  it("boş kovalar için kaynak üretmez", async () => {
    const r = await getEnvironment(
      stubHttp({ uuid: "e1", name: "production", applications: [], postgresqls: [], mysqls: [] }),
      "p",
      "production",
    );
    if (r.ok) expect(r.value.resources).toEqual([]);
  });

  it("bilinmeyen kovaları yok sayar", async () => {
    const r = await getEnvironment(
      stubHttp({ uuid: "e1", name: "production", applications: [], gelecektekiTur: [{ uuid: "x" }] }),
      "p",
      "production",
    );
    if (r.ok) expect(r.value.resources).toEqual([]);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `pnpm --filter @tower/coolify test api`
Beklenen: FAIL — `./api` çözümlenemiyor.

- [ ] **Step 3: Uygulamayı yaz**

`packages/coolify/src/api.ts`:

```ts
import type { CoolifyHttp } from "./http";
import { ok, type Result } from "./result";
import { parseStatus } from "./status";
import {
  RESOURCE_BUCKETS,
  type ApplicationDetail,
  type DatabaseBackup,
  type DatabaseSummary,
  type DeploymentSummary,
  type FleetEnvironment,
  type FleetProject,
  type FleetResource,
  type FleetServer,
  type S3Storage,
} from "./types";

type Raw = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const bool = (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : fallback);
const rows = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);

function map<T>(result: Result<unknown>, fn: (rows: Raw[]) => T[]): Result<T[]> {
  if (!result.ok) return result;
  return ok(fn(rows(result.value)));
}

export async function listServers(http: CoolifyHttp): Promise<Result<FleetServer[]>> {
  const r = await http.get<unknown>("/servers");
  return map(r, (list) =>
    list.map((s) => {
      const settings = (s.settings ?? {}) as Raw;
      return {
        uuid: str(s.uuid),
        name: str(s.name),
        reachable: bool(settings.is_reachable),
        usable: bool(settings.is_usable),
      };
    }),
  );
}

export async function listProjects(
  http: CoolifyHttp,
): Promise<Result<Array<{ uuid: string; name: string }>>> {
  const r = await http.get<unknown>("/projects");
  return map(r, (list) => list.map((p) => ({ uuid: str(p.uuid), name: str(p.name) })));
}

export async function listEnvironments(
  http: CoolifyHttp,
  projectUuid: string,
): Promise<Result<Array<{ uuid: string; name: string }>>> {
  const r = await http.get<unknown>(`/projects/${projectUuid}/environments`);
  return map(r, (list) => list.map((e) => ({ uuid: str(e.uuid), name: str(e.name) })));
}

export async function getEnvironment(
  http: CoolifyHttp,
  projectUuid: string,
  environmentName: string,
  projectName = "",
): Promise<Result<FleetEnvironment>> {
  const r = await http.get<Raw>(`/projects/${projectUuid}/${environmentName}`);
  if (!r.ok) return r;

  const detail = r.value;
  const name = str(detail.name, environmentName);
  const resources: FleetResource[] = [];

  for (const [bucket, kind] of Object.entries(RESOURCE_BUCKETS)) {
    for (const item of rows(detail[bucket])) {
      resources.push({
        uuid: str(item.uuid),
        name: str(item.name),
        kind,
        status: parseStatus(str(item.status)),
        projectUuid,
        projectName,
        environmentName: name,
      });
    }
  }

  return ok({ uuid: str(detail.uuid), name, resources });
}

export async function listDatabases(http: CoolifyHttp): Promise<Result<DatabaseSummary[]>> {
  const r = await http.get<unknown>("/databases");
  return map(r, (list) =>
    list.map((d) => ({
      uuid: str(d.uuid),
      name: str(d.name),
      status: parseStatus(str(d.status)),
      backups: [],
    })),
  );
}

export async function getDatabaseBackups(
  http: CoolifyHttp,
  databaseUuid: string,
): Promise<Result<DatabaseBackup[]>> {
  const r = await http.get<unknown>(`/databases/${databaseUuid}/backups`);
  return map(r, (list) =>
    list.map((b) => ({
      uuid: str(b.uuid),
      enabled: bool(b.enabled),
      frequency: str(b.frequency),
      saveToS3: bool(b.save_s3),
    })),
  );
}

export async function listS3Storages(http: CoolifyHttp): Promise<Result<S3Storage[]>> {
  const r = await http.get<unknown>("/s3-storages");
  return map(r, (list) =>
    list.map((s) => ({
      uuid: str(s.uuid),
      name: str(s.name),
      bucket: str(s.bucket),
      endpoint: str(s.endpoint),
      usable: bool(s.is_usable),
    })),
  );
}

export async function getApplication(
  http: CoolifyHttp,
  uuid: string,
): Promise<Result<ApplicationDetail>> {
  const r = await http.get<Raw>(`/applications/${uuid}`);
  if (!r.ok) return r;
  const a = r.value;

  return ok({
    uuid: str(a.uuid),
    name: str(a.name),
    description: str(a.description),
    buildPack: str(a.build_pack),
    gitRepository: str(a.git_repository),
    gitBranch: str(a.git_branch),
    domains: str(a.fqdn)
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean),
    portsExposed: str(a.ports_exposes),
    healthCheckEnabled: bool(a.health_check_enabled),
    healthCheckPath: str(a.health_check_path),
    limitsMemory: str(a.limits_memory, "0"),
    limitsCpus: str(a.limits_cpus, "0"),
    status: parseStatus(str(a.status)),
  });
}

export async function listDeployments(http: CoolifyHttp): Promise<Result<DeploymentSummary[]>> {
  const r = await http.get<unknown>("/deployments");
  return map(r, (list) =>
    list.map((d) => ({
      uuid: str(d.deployment_uuid, str(d.uuid)),
      applicationName: str(d.application_name),
      status: str(d.status),
      createdAt: str(d.created_at),
    })),
  );
}
```

`packages/coolify/src/index.ts` dosyasına ekle:

```ts
export * from "./api";
```

- [ ] **Step 4: Testleri çalıştır, geçtiğini gör**

Run: `pnpm --filter @tower/coolify test`
Beklenen: tüm testler PASS.

- [ ] **Step 5: Yazma metodu bulunmadığını doğrula**

```bash
grep -rnE "method:\s*['\"](POST|PATCH|PUT|DELETE)" packages/coolify/src && echo "IHLAL" || echo "TEMIZ"
```
Beklenen: `TEMIZ`.

- [ ] **Step 6: Commit**

```bash
git add packages/coolify/src
git commit -m "feat(coolify): add read-only API methods over fixtures"
```

---

### Task 7: `loadFleet` toplayıcı — sınırlı eşzamanlılık, kısmi hata dayanıklılığı

**Files:**
- Create: `packages/coolify/src/pool.ts`
- Create: `packages/coolify/src/fleet.ts`
- Test: `packages/coolify/src/fleet.test.ts`
- Modify: `packages/coolify/src/index.ts`

**Interfaces:**
- Consumes: `listProjects`, `listEnvironments`, `getEnvironment`, `listServers` (Task 6).
- Produces: `mapPool<I, O>(items, limit, fn): Promise<O[]>`, `loadFleet(http): Promise<Result<Fleet>>`, `Fleet = { servers: FleetServer[]; projects: FleetProject[]; loadedAt: string }`.

- [ ] **Step 1: Testi yaz**

`packages/coolify/src/fleet.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { CoolifyHttp } from "./http";
import { err, ok } from "./result";
import { loadFleet } from "./fleet";
import { mapPool } from "./pool";

function routedHttp(routes: Record<string, unknown>, failing: string[] = []): CoolifyHttp {
  return {
    get: async <T>(path: string) => {
      if (failing.includes(path)) return err<T>("unreachable", `düştü: ${path}`);
      const hit = routes[path];
      if (hit === undefined) return err<T>("not_found", path);
      return ok(hit as T);
    },
  };
}

const ROUTES = {
  "/servers": [{ uuid: "s1", name: "nexstep-1", settings: { is_reachable: true, is_usable: true } }],
  "/projects": [
    { uuid: "p1", name: "nexauth" },
    { uuid: "p2", name: "clientb" },
  ],
  "/projects/p1/environments": [{ uuid: "e1", name: "production" }],
  "/projects/p2/environments": [{ uuid: "e2", name: "production" }],
  "/projects/p1/production": {
    uuid: "e1",
    name: "production",
    applications: [{ uuid: "a1", name: "nexauth", status: "running:healthy" }],
    postgresqls: [{ uuid: "d1", name: "postgresql-nexauth", status: "running:healthy" }],
  },
  "/projects/p2/production": {
    uuid: "e2",
    name: "production",
    applications: [{ uuid: "a2", name: "clientb-web", status: "running:unknown" }],
  },
};

describe("mapPool", () => {
  it("eşzamanlılık sınırını aşmaz", async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapPool(items, 6, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active -= 1;
      return n;
    });

    expect(peak).toBeLessThanOrEqual(6);
  });

  it("sırayı korur", async () => {
    const out = await mapPool([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40]);
  });
});

describe("loadFleet", () => {
  it("projeleri, environment'ları ve kaynakları toplar", async () => {
    const r = await loadFleet(routedHttp(ROUTES));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.servers).toHaveLength(1);
    expect(r.value.projects).toHaveLength(2);

    const nexauth = r.value.projects.find((p) => p.name === "nexauth");
    expect(nexauth?.environments[0].resources).toHaveLength(2);
    expect(nexauth?.environments[0].resources[0].projectName).toBe("nexauth");
    expect(typeof r.value.loadedAt).toBe("string");
  });

  it("tek projenin düşmesi ağacı çökertmez", async () => {
    const r = await loadFleet(routedHttp(ROUTES, ["/projects/p2/environments"]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.projects).toHaveLength(2);
    const clientb = r.value.projects.find((p) => p.name === "clientb");
    expect(clientb?.failure).toBeTruthy();
    expect(clientb?.environments).toEqual([]);

    const nexauth = r.value.projects.find((p) => p.name === "nexauth");
    expect(nexauth?.failure).toBeUndefined();
    expect(nexauth?.environments[0].resources.length).toBeGreaterThan(0);
  });

  it("proje listesi alınamazsa hata döner", async () => {
    const r = await loadFleet(routedHttp(ROUTES, ["/projects"]));
    expect(r.ok).toBe(false);
  });

  it("sunucu listesi düşse bile projeler yüklenir", async () => {
    const r = await loadFleet(routedHttp(ROUTES, ["/servers"]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.servers).toEqual([]);
      expect(r.value.projects).toHaveLength(2);
    }
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `pnpm --filter @tower/coolify test fleet`
Beklenen: FAIL — `./fleet` ve `./pool` çözümlenemiyor.

- [ ] **Step 3: Uygulamayı yaz**

`packages/coolify/src/pool.ts`:

```ts
/** Girdi sırasını koruyarak, en fazla `limit` iş aynı anda çalışacak şekilde eşler. */
export async function mapPool<I, O>(
  items: readonly I[],
  limit: number,
  fn: (item: I, index: number) => Promise<O>,
): Promise<O[]> {
  const out = new Array<O>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return out;
}
```

`packages/coolify/src/fleet.ts`:

```ts
import { getEnvironment, listEnvironments, listProjects, listServers } from "./api";
import type { CoolifyHttp } from "./http";
import { mapPool } from "./pool";
import { ok, type Result } from "./result";
import type { FleetEnvironment, FleetProject, FleetServer } from "./types";

const CONCURRENCY = 6;

export type Fleet = {
  servers: FleetServer[];
  projects: FleetProject[];
  /** ISO 8601. Kartların tazelik göstergesi bunu kullanır. */
  loadedAt: string;
};

export async function loadFleet(http: CoolifyHttp): Promise<Result<Fleet>> {
  const projectsResult = await listProjects(http);
  if (!projectsResult.ok) return projectsResult;

  // Sunucu listesi ikincildir: düşerse ağaç yine kurulur.
  const serversResult = await listServers(http);
  const servers = serversResult.ok ? serversResult.value : [];

  const projects = await mapPool(projectsResult.value, CONCURRENCY, async (project): Promise<FleetProject> => {
    const envList = await listEnvironments(http, project.uuid);
    if (!envList.ok) {
      return { uuid: project.uuid, name: project.name, environments: [], failure: envList.error.message };
    }

    const environments = await mapPool(envList.value, CONCURRENCY, async (env): Promise<FleetEnvironment> => {
      const detail = await getEnvironment(http, project.uuid, env.name, project.name);
      if (!detail.ok) return { uuid: env.uuid, name: env.name, resources: [] };
      return detail.value;
    });

    return { uuid: project.uuid, name: project.name, environments };
  });

  return ok({ servers, projects, loadedAt: new Date().toISOString() });
}
```

`packages/coolify/src/index.ts` dosyasına ekle:

```ts
export type { Fleet } from "./fleet";
export { loadFleet } from "./fleet";
export { mapPool } from "./pool";
```

- [ ] **Step 4: Testleri çalıştır, geçtiğini gör**

Run: `pnpm --filter @tower/coolify test`
Beklenen: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/coolify/src
git commit -m "feat(coolify): add loadFleet with bounded concurrency and partial-failure tolerance"
```

---

### Task 8: Risk sayaçları

Spec'in dört bulgusu burada koda dönüşür. Genel Durum sayfası bunu render eder.

**Files:**
- Create: `packages/coolify/src/risks.ts`
- Test: `packages/coolify/src/risks.test.ts`
- Modify: `packages/coolify/src/index.ts`

**Interfaces:**
- Consumes: `Fleet` (Task 7), `DatabaseSummary`, `FleetResource` (Task 4).
- Produces: `computeRisks(input: RiskInput): RiskReport`, `RiskInput = { fleet: Fleet; databases: DatabaseSummary[]; applications: ApplicationDetail[] }`, `RiskReport = { unbackedDatabases; healthcheckDisabledApps; downResources; unreachableServers }` — her biri `{ count: number; items: Array<{ uuid: string; name: string }> }`.

- [ ] **Step 1: Testi yaz**

`packages/coolify/src/risks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeRisks } from "./risks";
import { parseStatus } from "./status";
import type { ApplicationDetail, DatabaseSummary, FleetProject } from "./types";
import type { Fleet } from "./fleet";

const project = (resources: FleetProject["environments"][number]["resources"]): FleetProject => ({
  uuid: "p1",
  name: "nexauth",
  environments: [{ uuid: "e1", name: "production", resources }],
});

const fleet = (overrides: Partial<Fleet> = {}): Fleet => ({
  servers: [{ uuid: "s1", name: "nexstep-1", reachable: true, usable: true }],
  projects: [],
  loadedAt: "2026-09-20T00:00:00.000Z",
  ...overrides,
});

const app = (over: Partial<ApplicationDetail> = {}): ApplicationDetail => ({
  uuid: "a1",
  name: "nexauth",
  description: "",
  buildPack: "dockerfile",
  gitRepository: "talhabera/nexauth",
  gitBranch: "main",
  domains: [],
  portsExposed: "5050",
  healthCheckEnabled: false,
  healthCheckPath: "/",
  limitsMemory: "0",
  limitsCpus: "0",
  status: parseStatus("running:unknown"),
  ...over,
});

describe("computeRisks", () => {
  it("yedek programı olmayan veritabanlarını sayar", () => {
    const databases: DatabaseSummary[] = [
      { uuid: "d1", name: "postgresql-nexauth", status: parseStatus("running:healthy"), backups: [] },
      {
        uuid: "d2",
        name: "postgresql-clientb",
        status: parseStatus("running:healthy"),
        backups: [{ uuid: "b1", enabled: true, frequency: "0 2 * * *", saveToS3: true }],
      },
    ];

    const r = computeRisks({ fleet: fleet(), databases, applications: [] });
    expect(r.unbackedDatabases.count).toBe(1);
    expect(r.unbackedDatabases.items[0].name).toBe("postgresql-nexauth");
  });

  it("devre dışı yedek programını yedeksiz sayar", () => {
    const databases: DatabaseSummary[] = [
      {
        uuid: "d1",
        name: "postgres-trader",
        status: parseStatus("running:healthy"),
        backups: [{ uuid: "b1", enabled: false, frequency: "0 2 * * *", saveToS3: true }],
      },
    ];
    expect(computeRisks({ fleet: fleet(), databases, applications: [] }).unbackedDatabases.count).toBe(1);
  });

  it("healthcheck'i kapalı uygulamaları sayar", () => {
    const applications = [app({ healthCheckEnabled: false }), app({ uuid: "a2", healthCheckEnabled: true })];
    const r = computeRisks({ fleet: fleet(), databases: [], applications });
    expect(r.healthcheckDisabledApps.count).toBe(1);
    expect(r.healthcheckDisabledApps.items[0].uuid).toBe("a1");
  });

  it("çalışmayan kaynakları sayar", () => {
    const f = fleet({
      projects: [
        project([
          { uuid: "r1", name: "relay-web", kind: "application", status: parseStatus("exited:unhealthy"), projectUuid: "p1", projectName: "nexauth", environmentName: "production" },
          { uuid: "r2", name: "nexauth", kind: "application", status: parseStatus("running:healthy"), projectUuid: "p1", projectName: "nexauth", environmentName: "production" },
        ]),
      ],
    });

    const r = computeRisks({ fleet: f, databases: [], applications: [] });
    expect(r.downResources.count).toBe(1);
    expect(r.downResources.items[0].name).toBe("relay-web");
  });

  it("running:unknown'ı düşmüş SAYMAZ", () => {
    const f = fleet({
      projects: [
        project([
          { uuid: "r1", name: "trader-web", kind: "application", status: parseStatus("running:unknown"), projectUuid: "p1", projectName: "nexauth", environmentName: "production" },
        ]),
      ],
    });
    expect(computeRisks({ fleet: f, databases: [], applications: [] }).downResources.count).toBe(0);
  });

  it("erişilemeyen veya kullanılamaz sunucuları sayar", () => {
    const f = fleet({
      servers: [
        { uuid: "s1", name: "nexstep-1", reachable: true, usable: true },
        { uuid: "s2", name: "bera-cloud-1", reachable: false, usable: true },
        { uuid: "s3", name: "trader-1", reachable: true, usable: false },
      ],
    });
    expect(computeRisks({ fleet: f, databases: [], applications: [] }).unreachableServers.count).toBe(2);
  });

  it("her şey yolundayken tüm sayaçlar sıfırdır", () => {
    const r = computeRisks({ fleet: fleet(), databases: [], applications: [] });
    expect(r.unbackedDatabases.count).toBe(0);
    expect(r.healthcheckDisabledApps.count).toBe(0);
    expect(r.downResources.count).toBe(0);
    expect(r.unreachableServers.count).toBe(0);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `pnpm --filter @tower/coolify test risks`
Beklenen: FAIL — `./risks` çözümlenemiyor.

- [ ] **Step 3: Uygulamayı yaz**

`packages/coolify/src/risks.ts`:

```ts
import type { Fleet } from "./fleet";
import type { ApplicationDetail, DatabaseSummary } from "./types";

export type RiskItem = { uuid: string; name: string };
export type RiskBucket = { count: number; items: RiskItem[] };

export type RiskReport = {
  unbackedDatabases: RiskBucket;
  healthcheckDisabledApps: RiskBucket;
  downResources: RiskBucket;
  unreachableServers: RiskBucket;
};

export type RiskInput = {
  fleet: Fleet;
  databases: DatabaseSummary[];
  applications: ApplicationDetail[];
};

const bucket = (items: RiskItem[]): RiskBucket => ({ count: items.length, items });

export function computeRisks({ fleet, databases, applications }: RiskInput): RiskReport {
  const unbacked = databases
    .filter((d) => !d.backups.some((b) => b.enabled))
    .map((d) => ({ uuid: d.uuid, name: d.name }));

  const noHealthcheck = applications
    .filter((a) => !a.healthCheckEnabled)
    .map((a) => ({ uuid: a.uuid, name: a.name }));

  const down = fleet.projects
    .flatMap((p) => p.environments)
    .flatMap((e) => e.resources)
    // running:unknown healthcheck eksikliğidir, düşmüş değildir — ayrı sayaçta izlenir.
    .filter((r) => r.status.state !== "running" && r.status.state !== "unknown")
    .map((r) => ({ uuid: r.uuid, name: r.name }));

  const servers = fleet.servers
    .filter((s) => !s.reachable || !s.usable)
    .map((s) => ({ uuid: s.uuid, name: s.name }));

  return {
    unbackedDatabases: bucket(unbacked),
    healthcheckDisabledApps: bucket(noHealthcheck),
    downResources: bucket(down),
    unreachableServers: bucket(servers),
  };
}
```

`packages/coolify/src/index.ts` dosyasına ekle:

```ts
export type { RiskBucket, RiskInput, RiskItem, RiskReport } from "./risks";
export { computeRisks } from "./risks";
```

- [ ] **Step 4: Testleri çalıştır, geçtiğini gör**

Run: `pnpm --filter @tower/coolify test && pnpm --filter @tower/coolify typecheck`
Beklenen: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/coolify/src
git commit -m "feat(coolify): add infrastructure risk counters"
```

---

### Task 9: Web tarafı sunucu sınırı + paket sızıntı testi

**Files:**
- Create: `apps/web/src/server/coolify.ts`
- Test: `apps/web/src/server/coolify.test.ts`
- Test: `apps/web/src/server/bundle-safety.test.ts`
- Create: `apps/web/vitest.config.ts`
- Modify: `apps/web/package.json` (`@tower/coolify` bağımlılığı, `test` scripti, vitest)
- Modify: `apps/web/next.config.ts` (`transpilePackages`)

**Interfaces:**
- Consumes: `readConfig`, `createClient`, `loadFleet`, `computeRisks` (Task 1-8).
- Produces: `getCoolify(): Result<CoolifyHttp>` — süreç başına tek istemci; `server-only` içe aktarımıyla korunur.

- [ ] **Step 1: Bağımlılıkları ve yapılandırmayı ekle**

`apps/web/package.json` — `dependencies` içine:

```json
"@tower/coolify": "workspace:*",
"server-only": "^0.0.1"
```

`devDependencies` içine `"vitest": "^3"`, `scripts` içine `"test": "vitest run"`.

`apps/web/next.config.ts` — `nextConfig` nesnesine ekle:

```ts
transpilePackages: ["@tower/coolify"],
```

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { globals: true, environment: "node" },
  resolve: { alias: { "server-only": new URL("./src/test/server-only-stub.ts", import.meta.url).pathname } },
});
```

`apps/web/src/test/server-only-stub.ts`:

```ts
// vitest Node ortamında çalışır; server-only paketi orada anlamsızdır.
export {};
```

Repo kökünden: `pnpm install`

- [ ] **Step 2: Testleri yaz**

`apps/web/src/server/coolify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCoolify } from "./coolify";

describe("buildCoolify", () => {
  it("env eksikse hata döner", () => {
    const r = buildCoolify({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("malformed");
  });

  it("env tamsa istemci döner", () => {
    const r = buildCoolify({ COOLIFY_URL: "https://panel.example.app", COOLIFY_TOKEN: "t" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(typeof r.value.get).toBe("function");
  });
});
```

`apps/web/src/server/bundle-safety.test.ts`:

```ts
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
  it("\"use client\" dosyaları sunucu gizli bilgilerine dokunmaz", () => {
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
```

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu gör**

Run: `pnpm --filter @tower/web test`
Beklenen: FAIL — `./coolify` çözümlenemiyor.

- [ ] **Step 4: Uygulamayı yaz**

`apps/web/src/server/coolify.ts`:

```ts
import "server-only";
import { createClient, readConfig, type CoolifyHttp, type Result } from "@tower/coolify";

/** Test edilebilirlik için env dışarıdan verilir. */
export function buildCoolify(env: Record<string, string | undefined>): Result<CoolifyHttp> {
  const config = readConfig(env);
  if (!config.ok) return config;
  return { ok: true, value: createClient(config.value) };
}

let cached: Result<CoolifyHttp> | null = null;

export function getCoolify(): Result<CoolifyHttp> {
  cached ??= buildCoolify(process.env);
  return cached;
}
```

- [ ] **Step 5: Testleri çalıştır, geçtiğini gör**

Run: `pnpm --filter @tower/web test`
Beklenen: iki test dosyası da PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat(web): add server-only Coolify boundary with bundle leak test"
```

---

### Task 10: NexAuth OIDC girişi (durumsuz, şifreli çerez)

NexAuth discovery adresi: `https://auth.example.app/api/auth/.well-known/openid-configuration` (2026-09-20'de doğrulandı; authorization code + PKCE, `offline_access` destekli).

**Files:**
- Create: `apps/web/src/server/session.ts`
- Create: `apps/web/src/server/oidc.ts`
- Create: `apps/web/src/app/api/auth/login/route.ts`
- Create: `apps/web/src/app/api/auth/callback/route.ts`
- Create: `apps/web/src/app/api/auth/logout/route.ts`
- Create: `apps/web/src/proxy.ts`
- Test: `apps/web/src/server/session.test.ts`
- Modify: `apps/web/package.json` (`openid-client`, `jose`)

**Interfaces:**
- Consumes: yok (bağımsız dikey).
- Produces: `sealSession(session, secret)`, `unsealSession(token, secret)`, `TowerSession = { sub: string; email: string; name: string; expiresAt: number }`, `SESSION_COOKIE = "tower_session"`.

- [ ] **Step 1: Bağımlılıkları ekle**

`apps/web/package.json` — `dependencies`: `"openid-client": "^6"`, `"jose": "^5"`. Repo kökünden `pnpm install`.

- [ ] **Step 2: Testi yaz**

`apps/web/src/server/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sealSession, unsealSession, type TowerSession } from "./session";

const SECRET = "0123456789abcdef0123456789abcdef";

const session: TowerSession = {
  sub: "user-1",
  email: "owner@example.org",
  name: "Talha",
  expiresAt: Date.now() + 3_600_000,
};

describe("oturum çerezi", () => {
  it("mühürleyip geri açar", async () => {
    const token = await sealSession(session, SECRET);
    const back = await unsealSession(token, SECRET);
    expect(back?.sub).toBe("user-1");
    expect(back?.email).toBe("owner@example.org");
  });

  it("mühürlü metin düz veri sızdırmaz", async () => {
    const token = await sealSession(session, SECRET);
    expect(token).not.toContain("example.org");
    expect(token).not.toContain("user-1");
  });

  it("yanlış gizli anahtarla açılmaz", async () => {
    const token = await sealSession(session, SECRET);
    expect(await unsealSession(token, "ffffffffffffffffffffffffffffffff")).toBeNull();
  });

  it("bozuk token'da null döner", async () => {
    expect(await unsealSession("çöp", SECRET)).toBeNull();
  });

  it("süresi geçmiş oturumu reddeder", async () => {
    const expired = { ...session, expiresAt: Date.now() - 1000 };
    const token = await sealSession(expired, SECRET);
    expect(await unsealSession(token, SECRET)).toBeNull();
  });
});
```

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu gör**

Run: `pnpm --filter @tower/web test session`
Beklenen: FAIL — `./session` çözümlenemiyor.

- [ ] **Step 4: Oturum katmanını yaz**

`apps/web/src/server/session.ts`:

```ts
import "server-only";
import { CompactEncrypt, compactDecrypt } from "jose";

export const SESSION_COOKIE = "tower_session";

export type TowerSession = {
  sub: string;
  email: string;
  name: string;
  /** epoch ms */
  expiresAt: number;
};

function keyFrom(secret: string): Uint8Array {
  const bytes = new TextEncoder().encode(secret);
  if (bytes.length < 32) throw new Error("TOWER_SESSION_SECRET en az 32 bayt olmalı");
  return bytes.slice(0, 32);
}

export async function sealSession(session: TowerSession, secret: string): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(session));
  return new CompactEncrypt(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(keyFrom(secret));
}

export async function unsealSession(
  token: string,
  secret: string,
): Promise<TowerSession | null> {
  try {
    const { plaintext } = await compactDecrypt(token, keyFrom(secret));
    const session = JSON.parse(new TextDecoder().decode(plaintext)) as TowerSession;
    if (typeof session.expiresAt !== "number" || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Testleri çalıştır, geçtiğini gör**

Run: `pnpm --filter @tower/web test session`
Beklenen: beş test de PASS.

- [ ] **Step 6: OIDC akışını ve korumayı yaz**

`apps/web/src/server/oidc.ts`:

```ts
import "server-only";
import * as client from "openid-client";

let cached: client.Configuration | null = null;

export async function oidcConfig(): Promise<client.Configuration> {
  if (cached) return cached;
  const issuer = process.env.NEXAUTH_ISSUER;
  const clientId = process.env.TOWER_OIDC_CLIENT_ID;
  const clientSecret = process.env.TOWER_OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) {
    throw new Error("NEXAUTH_ISSUER / TOWER_OIDC_CLIENT_ID / TOWER_OIDC_CLIENT_SECRET eksik");
  }
  cached = await client.discovery(new URL(issuer), clientId, clientSecret);
  return cached;
}

export function callbackUrl(): string {
  const base = process.env.TOWER_BASE_URL ?? "http://localhost:3000";
  return `${base}/api/auth/callback`;
}
```

`apps/web/src/app/api/auth/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import * as client from "openid-client";
import { callbackUrl, oidcConfig } from "@/server/oidc";

export async function GET() {
  const config = await oidcConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl(),
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  const response = NextResponse.redirect(url.href);
  const options = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  response.cookies.set("tower_pkce", codeVerifier, options);
  response.cookies.set("tower_state", state, options);
  return response;
}
```

`apps/web/src/app/api/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import * as client from "openid-client";
import { callbackUrl, oidcConfig } from "@/server/oidc";
import { SESSION_COOKIE, sealSession } from "@/server/session";

export async function GET(request: NextRequest) {
  const codeVerifier = request.cookies.get("tower_pkce")?.value;
  const expectedState = request.cookies.get("tower_state")?.value;
  const secret = process.env.TOWER_SESSION_SECRET;

  if (!codeVerifier || !expectedState || !secret) {
    return NextResponse.redirect(new URL("/giris-hatasi", request.url));
  }

  const config = await oidcConfig();
  let claims: Record<string, unknown>;
  try {
    const tokens = await client.authorizationCodeGrant(config, new URL(request.url), {
      pkceCodeVerifier: codeVerifier,
      expectedState,
      redirect_uri: callbackUrl(),
    });
    claims = (tokens.claims() ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.redirect(new URL("/giris-hatasi", request.url));
  }

  const token = await sealSession(
    {
      sub: String(claims.sub ?? ""),
      email: String(claims.email ?? ""),
      name: String(claims.name ?? ""),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    },
    secret,
  );

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  response.cookies.delete("tower_pkce");
  response.cookies.delete("tower_state");
  return response;
}
```

`apps/web/src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/session";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/api/auth/login", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
```

`apps/web/src/proxy.ts` (Next.js 16'da `middleware.ts` değil `proxy.ts`; nexauth da bu adlandırmayı kullanır):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/session";

/**
 * Giriş yapılmamış istek hiçbir Coolify çağrısı tetiklemez:
 * kontrol sayfadan ÖNCE burada yapılır.
 * Not: burada yalnızca çerezin varlığına bakılır; mühür doğrulaması
 * sayfa tarafındaki requireSession() içinde yapılır (Edge'de kripto maliyeti yüksek).
 */
export function proxy(request: NextRequest) {
  const isPublic =
    request.nextUrl.pathname.startsWith("/api/auth") ||
    request.nextUrl.pathname === "/giris-hatasi";

  if (isPublic) return NextResponse.next();

  if (!request.cookies.get(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/api/auth/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 7: `requireSession` yardımcısını ekle**

`apps/web/src/server/session.ts` dosyasının sonuna:

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function requireSession(): Promise<TowerSession> {
  const secret = process.env.TOWER_SESSION_SECRET;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = secret && token ? await unsealSession(token, secret) : null;
  if (!session) redirect("/api/auth/login");
  return session;
}
```

- [ ] **Step 8: Doğrula**

```bash
pnpm --filter @tower/web test && pnpm typecheck && pnpm lint
```
Beklenen: hepsi temiz.

- [ ] **Step 9: Commit**

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat(web): add NexAuth OIDC login with stateless encrypted session"
```

---

### Task 11: Veri yükleyici + kart tazelik durumları

**Files:**
- Create: `apps/web/src/server/dashboard.ts`
- Create: `apps/web/src/components/durum-rozeti.tsx`
- Create: `apps/web/src/components/kart.tsx`
- Test: `apps/web/src/server/dashboard.test.ts`

**Interfaces:**
- Consumes: `getCoolify` (Task 9), `loadFleet`, `computeRisks`, `listDatabases`, `getDatabaseBackups`, `getApplication`, `listS3Storages` (Task 6-8).
- Produces: `loadDashboard(): Promise<DashboardData>`, `DashboardData = { state: "ok" | "unauthorized" | "unreachable"; fleet: Fleet | null; risks: RiskReport | null; databases: DatabaseSummary[]; storages: S3Storage[]; loadedAt: string | null; message?: string }`; `<DurumRozeti status />`, `<Kart title tazelik>`.

- [ ] **Step 1: Testi yaz**

`apps/web/src/server/dashboard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toDashboard } from "./dashboard";
import { err, ok, parseStatus, type Fleet } from "@tower/coolify";

const fleet: Fleet = {
  servers: [{ uuid: "s1", name: "nexstep-1", reachable: true, usable: true }],
  projects: [],
  loadedAt: "2026-09-20T10:00:00.000Z",
};

describe("toDashboard", () => {
  it("401'de unauthorized durumuna düşer", () => {
    const d = toDashboard(err("unauthorized", "token reddedildi", 401), [], [], []);
    expect(d.state).toBe("unauthorized");
    expect(d.fleet).toBeNull();
  });

  it("ağ hatasında unreachable durumuna düşer", () => {
    const d = toDashboard(err("unreachable", "ulaşılamadı"), [], [], []);
    expect(d.state).toBe("unreachable");
  });

  it("başarıda risk raporu hesaplar", () => {
    const databases = [
      { uuid: "d1", name: "postgresql-nexauth", status: parseStatus("running:healthy"), backups: [] },
    ];
    const d = toDashboard(ok(fleet), databases, [], []);
    expect(d.state).toBe("ok");
    expect(d.risks?.unbackedDatabases.count).toBe(1);
    expect(d.loadedAt).toBe("2026-09-20T10:00:00.000Z");
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `pnpm --filter @tower/web test dashboard`
Beklenen: FAIL — `./dashboard` çözümlenemiyor.

- [ ] **Step 3: Uygulamayı yaz**

`apps/web/src/server/dashboard.ts`:

```ts
import "server-only";
import {
  computeRisks,
  getApplication,
  getDatabaseBackups,
  listDatabases,
  listS3Storages,
  loadFleet,
  mapPool,
  type ApplicationDetail,
  type DatabaseSummary,
  type Fleet,
  type Result,
  type RiskReport,
  type S3Storage,
} from "@tower/coolify";
import { getCoolify } from "./coolify";

export type DashboardData = {
  state: "ok" | "unauthorized" | "unreachable";
  fleet: Fleet | null;
  risks: RiskReport | null;
  databases: DatabaseSummary[];
  storages: S3Storage[];
  loadedAt: string | null;
  message?: string;
};

/** Saf dönüşüm — test edilebilir olsun diye ağ çağrısından ayrıldı. */
export function toDashboard(
  fleetResult: Result<Fleet>,
  databases: DatabaseSummary[],
  applications: ApplicationDetail[],
  storages: S3Storage[],
): DashboardData {
  if (!fleetResult.ok) {
    const state = fleetResult.error.kind === "unauthorized" ? "unauthorized" : "unreachable";
    return {
      state,
      fleet: null,
      risks: null,
      databases: [],
      storages: [],
      loadedAt: null,
      message: fleetResult.error.message,
    };
  }

  return {
    state: "ok",
    fleet: fleetResult.value,
    risks: computeRisks({ fleet: fleetResult.value, databases, applications }),
    databases,
    storages,
    loadedAt: fleetResult.value.loadedAt,
  };
}

export async function loadDashboard(): Promise<DashboardData> {
  const http = getCoolify();
  if (!http.ok) {
    return {
      state: "unreachable",
      fleet: null,
      risks: null,
      databases: [],
      storages: [],
      loadedAt: null,
      message: http.error.message,
    };
  }

  const fleetResult = await loadFleet(http.value);

  const dbList = await listDatabases(http.value);
  const databases = dbList.ok
    ? await mapPool(dbList.value, 6, async (db) => {
        const backups = await getDatabaseBackups(http.value, db.uuid);
        return { ...db, backups: backups.ok ? backups.value : [] };
      })
    : [];

  const appUuids = fleetResult.ok
    ? fleetResult.value.projects
        .flatMap((p) => p.environments)
        .flatMap((e) => e.resources)
        .filter((r) => r.kind === "application")
        .map((r) => r.uuid)
    : [];

  const applications = (
    await mapPool(appUuids, 6, async (uuid) => getApplication(http.value, uuid))
  )
    .filter((r) => r.ok)
    .map((r) => r.value);

  const storageResult = await listS3Storages(http.value);

  return toDashboard(
    fleetResult,
    databases,
    applications,
    storageResult.ok ? storageResult.value : [],
  );
}
```

`apps/web/src/components/durum-rozeti.tsx`:

```tsx
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
```

`apps/web/src/components/kart.tsx`:

```tsx
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
```

- [ ] **Step 4: Testleri çalıştır, geçtiğini gör**

Run: `pnpm --filter @tower/web test`
Beklenen: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add dashboard loader with freshness states"
```

---

### Task 12: Genel Durum sayfası — dört risk sayacı

**Files:**
- Modify: `apps/web/src/app/page.tsx` (scaffold içeriği tamamen değiştirilir)
- Create: `apps/web/src/app/giris-hatasi/page.tsx`
- Modify: `apps/web/src/app/layout.tsx` (başlık ve gezinme)

**Interfaces:**
- Consumes: `loadDashboard` (Task 11), `requireSession` (Task 10), `Kart` (Task 11).
- Produces: yok (yaprak sayfa).

- [ ] **Step 1: Sayfayı yaz**

`apps/web/src/app/page.tsx`:

```tsx
import Link from "next/link";
import { Kart } from "@/components/kart";
import { loadDashboard } from "@/server/dashboard";
import { requireSession } from "@/server/session";

export const revalidate = 10;

function Sayac({
  baslik,
  sayi,
  href,
  aciklama,
}: {
  baslik: string;
  sayi: number;
  href: string;
  aciklama: string;
}) {
  const tehlike = sayi > 0;
  return (
    <Link
      href={href}
      className={`block rounded-lg border p-4 transition ${
        tehlike
          ? "border-red-300 bg-red-50 hover:bg-red-100"
          : "border-neutral-200 bg-white hover:bg-neutral-50"
      }`}
    >
      <div className={`text-3xl font-semibold ${tehlike ? "text-red-700" : "text-neutral-400"}`}>
        {sayi}
      </div>
      <div className="mt-1 text-sm font-medium text-neutral-900">{baslik}</div>
      <p className="mt-1 text-xs text-neutral-600">{aciklama}</p>
    </Link>
  );
}

export default async function GenelDurum() {
  await requireSession();
  const data = await loadDashboard();

  if (data.state === "unauthorized") {
    return (
      <main className="p-8">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
          Coolify token&apos;ı geçersiz. `.env.local` içindeki `COOLIFY_TOKEN` yenilenmeli.
        </div>
      </main>
    );
  }

  if (data.state === "unreachable" || !data.risks) {
    return (
      <main className="p-8">
        <Kart baslik="Genel Durum" tazelik="ulasilamiyor">
          <p className="text-sm text-neutral-700">{data.message ?? "Coolify'a ulaşılamadı."}</p>
        </Kart>
      </main>
    );
  }

  const r = data.risks;

  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Genel Durum</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Sayac
          baslik="Yedeksiz veritabanı"
          sayi={r.unbackedDatabases.count}
          href="/yedekleme"
          aciklama="Yedek programı tanımlı olmayan veya devre dışı bırakılmış veritabanları"
        />
        <Sayac
          baslik="Healthcheck'siz uygulama"
          sayi={r.healthcheckDisabledApps.count}
          href="/filo?filtre=healthcheck"
          aciklama="Çöktüğünde çalışıyor görünecek uygulamalar"
        />
        <Sayac
          baslik="Düşmüş kaynak"
          sayi={r.downResources.count}
          href="/filo?filtre=dusmus"
          aciklama="Çalışmayan uygulama, servis veya veritabanı"
        />
        <Sayac
          baslik="Sorunlu sunucu"
          sayi={r.unreachableServers.count}
          href="/filo"
          aciklama="Erişilemeyen veya kullanılamaz durumdaki sunucular"
        />
      </div>

      <Kart baslik="Son okuma" zaman={data.loadedAt}>
        <p className="text-sm text-neutral-700">
          {data.fleet?.projects.length ?? 0} proje ·{" "}
          {data.fleet?.projects.flatMap((p) => p.environments).flatMap((e) => e.resources).length ?? 0} kaynak ·{" "}
          {data.fleet?.servers.length ?? 0} sunucu
          {data.loadedAt ? ` · ${new Date(data.loadedAt).toLocaleString("tr-TR")}` : ""}
        </p>
      </Kart>
    </main>
  );
}
```

`apps/web/src/app/giris-hatasi/page.tsx`:

```tsx
import Link from "next/link";

export default function GirisHatasi() {
  return (
    <main className="p-8">
      <h1 className="text-lg font-semibold">Giriş tamamlanamadı</h1>
      <p className="mt-2 text-sm text-neutral-700">
        NexAuth üzerinden kimlik doğrulama başarısız oldu.
      </p>
      <Link href="/api/auth/login" className="mt-4 inline-block text-sm underline">
        Tekrar dene
      </Link>
    </main>
  );
}
```

`apps/web/src/app/layout.tsx` — `<body>` içeriğini şu gezinme ile sar:

```tsx
<nav className="flex gap-4 border-b border-neutral-200 px-8 py-3 text-sm">
  <a href="/" className="font-medium">Genel Durum</a>
  <a href="/filo">Filo</a>
  <a href="/yedekleme">Yedekleme</a>
  <a href="/api/auth/logout" className="ml-auto text-neutral-500">Çıkış</a>
</nav>
{children}
```

Ayrıca `metadata.title` değerini `"Tower"`, `metadata.description` değerini `"NexStep altyapı kontrol odası"` yap ve `<html lang="tr">` olarak güncelle.

- [ ] **Step 2: Doğrula**

```bash
pnpm --filter @tower/web test && pnpm typecheck && pnpm lint && pnpm build
```
Beklenen: dördü de temiz.

- [ ] **Step 3: Elle bak**

```bash
pnpm dev
```
`http://localhost:3000` → NexAuth'a yönlendirir, giriş sonrası dört sayaç görünür. Bugünkü canlı veriyle beklenen: yedeksiz veritabanı **7**, healthcheck'siz uygulama **12**, düşmüş kaynak **3**, sorunlu sunucu **0**.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add overview page with four infrastructure risk counters"
```

---

### Task 13: Filo sayfası + kaynak detayı

**Files:**
- Create: `apps/web/src/app/filo/page.tsx`
- Create: `apps/web/src/app/filo/[uuid]/page.tsx`
- Create: `apps/web/src/components/kaynak-satiri.tsx`

**Interfaces:**
- Consumes: `loadDashboard` (Task 11), `getApplication`, `getCoolify` (Task 6, 9), `DurumRozeti` (Task 11).
- Produces: yok (yaprak sayfalar).

- [ ] **Step 1: Filo ağacını yaz**

`apps/web/src/components/kaynak-satiri.tsx`:

```tsx
import Link from "next/link";
import type { FleetResource } from "@tower/coolify";
import { DurumRozeti } from "./durum-rozeti";

export function KaynakSatiri({ kaynak }: { kaynak: FleetResource }) {
  return (
    <li className="flex items-center gap-3 border-t border-neutral-100 py-2 text-sm">
      <Link href={`/filo/${kaynak.uuid}`} className="min-w-0 flex-1 truncate hover:underline">
        {kaynak.name}
      </Link>
      <span className="shrink-0 text-xs text-neutral-500">{kaynak.kind}</span>
      <DurumRozeti status={kaynak.status} />
    </li>
  );
}
```

`apps/web/src/app/filo/page.tsx`:

```tsx
import { Kart } from "@/components/kart";
import { KaynakSatiri } from "@/components/kaynak-satiri";
import { loadDashboard } from "@/server/dashboard";
import { requireSession } from "@/server/session";

export const revalidate = 10;

export default async function Filo({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string }>;
}) {
  await requireSession();
  const { filtre } = await searchParams;
  const data = await loadDashboard();

  if (data.state !== "ok" || !data.fleet) {
    return (
      <main className="p-8">
        <Kart baslik="Filo" tazelik="ulasilamiyor">
          <p className="text-sm">{data.message ?? "Coolify'a ulaşılamadı."}</p>
        </Kart>
      </main>
    );
  }

  const healthcheckSiz = new Set(data.risks?.healthcheckDisabledApps.items.map((i) => i.uuid) ?? []);

  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Filo</h1>

      <Kart baslik="Sunucular" zaman={data.loadedAt}>
        <ul className="text-sm">
          {data.fleet.servers.map((s) => (
            <li key={s.uuid} className="flex justify-between border-t border-neutral-100 py-2">
              <span>{s.name}</span>
              <span className={s.reachable && s.usable ? "text-emerald-700" : "text-red-700"}>
                {s.reachable && s.usable ? "erişilebilir" : "sorunlu"}
              </span>
            </li>
          ))}
        </ul>
      </Kart>

      {data.fleet.projects.map((proje) => (
        <Kart
          key={proje.uuid}
          baslik={proje.name}
          tazelik={proje.failure ? "ulasilamiyor" : "taze"}
          zaman={data.loadedAt}
        >
          {proje.failure ? (
            <p className="text-sm text-amber-700">{proje.failure}</p>
          ) : (
            proje.environments.map((ortam) => {
              const kaynaklar = ortam.resources.filter((k) => {
                if (filtre === "dusmus") return k.status.state !== "running" && k.status.state !== "unknown";
                if (filtre === "healthcheck") return healthcheckSiz.has(k.uuid);
                return true;
              });
              if (kaynaklar.length === 0) return null;
              return (
                <div key={ortam.uuid} className="mb-3">
                  <h3 className="text-xs uppercase tracking-wide text-neutral-500">{ortam.name}</h3>
                  <ul>
                    {kaynaklar.map((k) => (
                      <KaynakSatiri key={k.uuid} kaynak={k} />
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </Kart>
      ))}
    </main>
  );
}
```

- [ ] **Step 2: Kaynak detay sayfasını yaz**

`apps/web/src/app/filo/[uuid]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getApplication } from "@tower/coolify";
import { DurumRozeti } from "@/components/durum-rozeti";
import { Kart } from "@/components/kart";
import { getCoolify } from "@/server/coolify";
import { requireSession } from "@/server/session";

export const revalidate = 10;

function Satir({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="flex gap-4 border-t border-neutral-100 py-2 text-sm">
      <span className="w-40 shrink-0 text-neutral-500">{etiket}</span>
      <span className="min-w-0 break-all">{deger || "—"}</span>
    </div>
  );
}

export default async function KaynakDetay({ params }: { params: Promise<{ uuid: string }> }) {
  await requireSession();
  const { uuid } = await params;

  const http = getCoolify();
  if (!http.ok) notFound();

  const app = await getApplication(http.value, uuid);
  if (!app.ok) {
    return (
      <main className="p-8">
        <Kart baslik="Kaynak" tazelik="ulasilamiyor">
          <p className="text-sm">{app.error.message}</p>
        </Kart>
      </main>
    );
  }

  const a = app.value;

  return (
    <main className="space-y-6 p-8">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{a.name}</h1>
        <DurumRozeti status={a.status} />
      </div>

      {!a.healthCheckEnabled && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Healthcheck kapalı. Bu uygulama çöktüğünde Coolify bunu fark etmez.
        </div>
      )}

      <Kart baslik="Yapılandırma">
        <Satir etiket="Build pack" deger={a.buildPack} />
        <Satir etiket="Git deposu" deger={a.gitRepository} />
        <Satir etiket="Dal" deger={a.gitBranch} />
        <Satir etiket="Açık portlar" deger={a.portsExposed} />
        <Satir etiket="Healthcheck" deger={a.healthCheckEnabled ? `açık · ${a.healthCheckPath}` : "kapalı"} />
        <Satir etiket="Bellek limiti" deger={a.limitsMemory === "0" ? "sınırsız" : a.limitsMemory} />
        <Satir etiket="CPU limiti" deger={a.limitsCpus === "0" ? "sınırsız" : a.limitsCpus} />
      </Kart>

      <Kart baslik="Alan adları">
        {a.domains.length === 0 ? (
          <p className="text-sm text-neutral-500">Tanımlı alan adı yok.</p>
        ) : (
          <ul className="text-sm">
            {a.domains.map((d) => (
              <li key={d} className="border-t border-neutral-100 py-2">
                {d}
              </li>
            ))}
          </ul>
        )}
      </Kart>
    </main>
  );
}
```

- [ ] **Step 3: Doğrula**

```bash
pnpm --filter @tower/web test && pnpm typecheck && pnpm lint && pnpm build
```
Beklenen: dördü de temiz.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add fleet tree and resource detail pages"
```

---

### Task 14: Yedekleme & Depolama sayfası

**Files:**
- Create: `apps/web/src/app/yedekleme/page.tsx`

**Interfaces:**
- Consumes: `loadDashboard` (Task 11), `DurumRozeti`, `Kart` (Task 11).
- Produces: yok (yaprak sayfa).

- [ ] **Step 1: Sayfayı yaz**

`apps/web/src/app/yedekleme/page.tsx`:

```tsx
import { DurumRozeti } from "@/components/durum-rozeti";
import { Kart } from "@/components/kart";
import { loadDashboard } from "@/server/dashboard";
import { requireSession } from "@/server/session";

export const revalidate = 10;

export default async function Yedekleme() {
  await requireSession();
  const data = await loadDashboard();

  if (data.state !== "ok") {
    return (
      <main className="p-8">
        <Kart baslik="Yedekleme" tazelik="ulasilamiyor">
          <p className="text-sm">{data.message ?? "Coolify'a ulaşılamadı."}</p>
        </Kart>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Yedekleme &amp; Depolama</h1>

      <Kart baslik="Veritabanları" zaman={data.loadedAt}>
        {data.databases.length === 0 ? (
          <p className="text-sm text-neutral-500">Veritabanı bulunamadı.</p>
        ) : (
          <ul className="text-sm">
            {data.databases.map((db) => {
              const aktif = db.backups.filter((b) => b.enabled);
              return (
                <li key={db.uuid} className="flex items-center gap-3 border-t border-neutral-100 py-2">
                  <span className="min-w-0 flex-1 truncate">{db.name}</span>
                  <DurumRozeti status={db.status} />
                  {aktif.length === 0 ? (
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-900 ring-1 ring-red-300">
                      yedek yok
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-neutral-600">
                      {aktif.map((b) => `${b.frequency}${b.saveToS3 ? " · S3" : ""}`).join(", ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Kart>

      <Kart baslik="S3 depolama hedefleri" zaman={data.loadedAt}>
        {data.storages.length === 0 ? (
          <p className="text-sm text-red-800">
            Tanımlı S3 hedefi yok. Yedek programı açılsa bile yedekler dışarı yazılamaz.
          </p>
        ) : (
          <ul className="text-sm">
            {data.storages.map((s) => (
              <li key={s.uuid} className="flex items-center gap-3 border-t border-neutral-100 py-2">
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-xs text-neutral-500">
                  {s.bucket} · {s.endpoint}
                </span>
                <span className={`text-xs ${s.usable ? "text-emerald-700" : "text-red-700"}`}>
                  {s.usable ? "kullanılabilir" : "doğrulanamadı"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Kart>
    </main>
  );
}
```

- [ ] **Step 2: Tam doğrulama**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Beklenen: dördü de sıfır çıkış kodu.

- [ ] **Step 3: Elle bak**

```bash
pnpm dev
```
`http://localhost:3000/yedekleme` → yedi veritabanının tamamı "yedek yok" kırmızı rozetiyle, S3 bölümü kırmızı uyarı metniyle görünmeli.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add backup and storage coverage page"
```

---

## Öz-denetim sonucu

**Spec kapsama kontrolü** — spec'in her bölümü bir task'a bağlı:

| Spec bölümü | Task |
|---|---|
| `@tower/coolify` yalnızca okuma | 1, 3, 6 (+ Task 6 Step 5 grep doğrulaması) |
| `Result` hata taksonomisi | 1, 3 |
| Filo ağacı `/projects/{uuid}/environments` üzerinden, eşzamanlılık 6, kısmi hata | 7 |
| Genel Durum — dört risk sayacı | 8, 12 |
| Filo ekranı, `running:unknown` sarı | 4, 11, 13 |
| Kaynak detayı, env yalnızca anahtar | 13 |
| Yedekleme & Depolama ekranı | 14 |
| Gizli bilgi kuralları, maskeleme, fixture sanitizasyonu | 2, 5, 9 |
| Hata durumu: taze/bayat/ulaşılamıyor + 401 bandı | 11, 12 |
| NexAuth OIDC, JWT çerez, DB yok | 10 |
| Test: fixture'lara karşı, sızıntı testi | 5, 6, 9 |

**Sapma:** Spec "tipler OpenAPI şemasından üretilir" diyordu. Coolify'ın `openapi.json` dosyası 1 MB ve 96 alanlı nesneler üretiyor; arayüzün ihtiyacı 12 alan. Task 4 bunun yerine dar görünüm tiplerini elle tanımlıyor ve ham cevabı `Raw` üzerinden savunmacı okuyor. Sonuç daha küçük, daha okunur ve şema değişimine daha dayanıklı. Spec'in amacı (ham 96 alanlı nesne render'a geçmesin) korunuyor.

**Kaldırılan kapsam:** Deployment akışı ekranı ayrı sayfa olarak planlanmadı — canlı instance'ta `/deployments` boş dizi dönüyor (aktif deploy yok). `listDeployments` metodu Task 6'da mevcut; ekran Faz 2'de gerçek veri oluştuğunda eklenecek.

**Tip tutarlılığı:** `Result`, `CoolifyHttp`, `Fleet`, `FleetResource`, `RiskReport`, `DashboardData`, `TowerSession` adları tanımlandıkları task'tan sonraki tüm kullanımlarda birebir aynı.
