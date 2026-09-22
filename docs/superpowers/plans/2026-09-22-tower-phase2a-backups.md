# Tower Faz 2A — Yedekleme Yazma Yolu: Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tower'dan, Coolify'daki `nexstep-tower` S3 hedefine giden veritabanı yedek programları kurulabilsin; her yazma Postgres'teki denetim kaydına düşsün.

**Architecture:** Coolify yazmaları `@tower/coolify/write` subpath girişinde yaşar (kök giriş salt okuma kalır). Yeni `@tower/db` paketi (Drizzle + postgres-js) denetim kaydını ve tek satırlık yedek preset'ini tutar. `apps/web` içindeki tek `performWrite()` geçidi yetki → denetim `pending` → işlem → denetim `ok/failed` sırasını zorlar; server action'lar yalnızca bu geçitten yazar.

**Tech Stack:** Next.js 16.3.5 (App Router, Server Functions), TypeScript strict, pnpm 11 workspace + turbo, vitest 3, drizzle-orm + drizzle-kit, postgres (postgres-js), Docker `postgres:17` (yalnızca entegrasyon testi).

**Spec:** `docs/superpowers/specs/2026-09-22-tower-phase2a-backups-design.md`

## Global Constraints

- Coolify canlı sürüm: **4.3.23**. Yedek programı ucu: `POST /api/v1/databases/{uuid}/backups`, zorunlu alan `frequency`; cevap `201 { uuid, message }`.
- Preset varsayılanları: `frequency='0 3 * * *'`, `keep_local=7`, `keep_s3=30`. Saat dilimi alanı YOK (Coolify API'sinde yok; cron sunucu saat diliminde çalışır).
- Hedef S3: yalnızca `listS3Storages` içinde `usable=true` olanlar. Bugün tek aday `nexstep-tower` (`ys1gbsu8rpv8pau8alksmfji`).
- Denetim eylemleri tam olarak: `backup.create`, `backup.protect_all`, `preset.update`.
- Denetim durumları: `pending | ok | failed`. Hata türleri: `CoolifyErrorKind | forbidden | db | needs_s3 | partial`.
- Yazma yetkisi: `TOWER_WRITER_EMAILS` (virgülle ayrılmış, büyük/küçük harf duyarsız). Boş/tanımsız = kimse yazamaz.
- `TOWER_ALLOWED_EMAILS` tamamen kaldırılır (kod + test + belge).
- Tower S3 kimlik bilgilerini hiçbir yerde okumaz/saklamaz/loglamaz.
- `performWrite` dışında hiçbir kod `@tower/coolify/write` metodu çağırmaz ve denetim satırı yazmaz.
- Hiçbir otomatik test canlı Coolify'a yazmaz.
- `.env.local` içindeki `COOLIFY_TOKEN` `|` içerir: shell ile `source` ETMEYİN; scriptler dosyayı `--env-file` / `process.loadEnvFile` ile okur.
- Kod yorumları ve UI metinleri Türkçe (mevcut kod stili).
- Her görev sonunda: `pnpm typecheck && pnpm lint && pnpm test` (repo kökünden) yeşil.
- Next 16 API'lerinden emin değilseniz önce `apps/web/node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` ve `02-guides/forms.md` okuyun.

## Dosya Haritası

| Dosya | Sorumluluk |
|---|---|
| `packages/coolify/src/redact.ts` | (değişir) çıplak `key` anahtarını maskeler |
| `packages/coolify/src/segment.ts` | (yeni) `seg()` — uuid path parçası doğrulama; api.ts ve write.ts paylaşır |
| `packages/coolify/src/http.ts` | (değişir) ortak `request(method, path, body?)`; `createWriteClient` |
| `packages/coolify/src/write.ts` | (yeni) `@tower/coolify/write` girişi: `createWriteClient`, `createBackupSchedule` |
| `packages/db/**` | (yeni) `@tower/db`: şema, migration, `TowerStore` |
| `apps/web/src/server/base-url.ts` | (yeni) `baseUrl`/`appUrl` — openid-client'sız, proxy'den import edilebilir |
| `apps/web/src/server/writers.ts` | (yeni) `parseEmailList`, `isWriter` |
| `apps/web/src/server/store.ts` | (yeni) `getStore()` — `DATABASE_URL`'den tekil store |
| `apps/web/src/server/write.ts` | (yeni) `performWrite` geçidi |
| `apps/web/src/server/backups.ts` | (yeni) `enableBackup`, `protectAll`, `listUnprotected` (saf, deps enjekte) |
| `apps/web/src/server/preset.ts` | (yeni) `parsePresetForm`, `presetTarget` |
| `apps/web/src/server/audit-view.ts` | (yeni) `auditDisplayStatus` |
| `apps/web/src/app/yedekleme/actions.ts` | (yeni) server action'lar |
| `apps/web/src/app/yedekleme/koru/page.tsx`, `preset/page.tsx`, `app/denetim/page.tsx` | (yeni) sayfalar |
| `apps/web/src/components/yedek-ac-butonu.tsx`, `koru-formu.tsx`, `preset-formu.tsx` | (yeni) istemci formları |

---

### Task 1: Fixture redact — çıplak `key` anahtarı

**Files:**
- Modify: `packages/coolify/src/redact.ts:6`
- Test: `packages/coolify/src/redact.test.ts`

**Interfaces:** Consumes: yok. Produces: `redactJson` artık `key` anahtarını `"***"` yapar (davranış değişikliği, imza aynı).

- [ ] **Step 1: Failing test ekle** (`redact.test.ts` içindeki mevcut `describe` bloğuna)

```ts
it("S3 cevabındaki çıplak `key` ve `secret` alanlarını maskeler", () => {
  const input = [{ uuid: "u1", name: "nexstep-tower", key: "AKIAEXAMPLEKEY123456", secret: "s3cr3t" }];
  expect(redactJson(input)).toEqual([{ uuid: "u1", name: "nexstep-tower", key: "***", secret: "***" }]);
});

it("`key` içeren ama `key` olmayan anahtarları maskelemez", () => {
  expect(redactJson({ monkey: "x", keys_count: 3 })).toEqual({ monkey: "x", keys_count: 3 });
});
```

- [ ] **Step 2: Çalıştır, FAIL gör**

Run: `pnpm --filter @tower/coolify test -- redact`
Expected: FAIL — `key: "AKIAEXAMPLEKEY123456"` beklenen `"***"` değil.

- [ ] **Step 3: Uygula** — `redact.ts` satır 6:

```ts
const SECRET_KEY_EXACT = new Set(["key", "custom_labels", "custom_docker_run_options"]);
```

Ve `redactJson` doc yorumundaki listeye `key` ekle: `... custom_labels, custom_docker_run_options, key),`.

- [ ] **Step 4: Çalıştır, PASS gör**

Run: `pnpm --filter @tower/coolify test`
Expected: tümü PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/coolify/src/redact.ts packages/coolify/src/redact.test.ts
git commit -m "fix(coolify): redact bare key field (S3 access key in /s3-storages)"
```

---

### Task 2: Auth sertleştirme — SHA-256 anahtar, base-URL proxy, allowlist kaldırma, yazıcı listesi

**Files:**
- Create: `apps/web/src/server/base-url.ts`, `apps/web/src/server/writers.ts`, `apps/web/src/server/writers.test.ts`
- Modify: `apps/web/src/server/session.ts:18-22`, `apps/web/src/proxy.ts`, `apps/web/src/server/oidc.ts:17-67`, `apps/web/src/app/api/auth/callback/route.ts:40`
- Test: `apps/web/src/server/session.test.ts`, `apps/web/src/proxy.test.ts`, `apps/web/src/server/oidc.test.ts`

**Interfaces:**
- Produces: `baseUrl(): string`, `appUrl(path: string): URL` (`@/server/base-url`); `parseEmailList(raw: string | undefined): Set<string>`, `isWriter(email: string, raw: string | undefined): boolean` (`@/server/writers`); `sessionIdentity(claims: Record<string, unknown>): SessionIdentity | null` (tek parametre).

- [ ] **Step 1: Failing testler**

`session.test.ts`'e ekle:

```ts
it("anahtar sırrın tamamından türetilir (ilk 32 bayt aynı, sonrası farklı sırlar birbirini açamaz)", async () => {
  const base = "a".repeat(32);
  const token = await sealSession(
    { sub: "u1", email: "a@example.com", name: "A", expiresAt: Date.now() + 60_000 },
    `${base}-birinci`,
  );
  expect(await unsealSession(token, `${base}-ikinci`)).toBeNull();
  expect(await unsealSession(token, `${base}-birinci`)).not.toBeNull();
});
```

`proxy.test.ts`'e ekle (dosyanın başındaki importlara `afterEach` ekle):

```ts
describe("proxy TOWER_BASE_URL", () => {
  const original = process.env.TOWER_BASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.TOWER_BASE_URL;
    else process.env.TOWER_BASE_URL = original;
  });

  it("girişe yönlendirmeyi Host başlığından değil TOWER_BASE_URL'den kurar", () => {
    process.env.TOWER_BASE_URL = "https://tower.example.com/";
    const request = new NextRequest("http://10.0.0.5:3000/filo");
    expect(proxy(request).headers.get("location")).toBe("https://tower.example.com/api/auth/login");
  });
});
```

Mevcut ilk proxy testi (`https://tower.example.com/panel` → `https://tower.example.com/api/auth/login`) `TOWER_BASE_URL` tanımsızken `http://localhost:3000/api/auth/login` bekler hale gelir; o testi şöyle değiştir:

```ts
it("oturum çerezi yoksa girişe yönlendirir (TOWER_BASE_URL yoksa localhost)", () => {
  delete process.env.TOWER_BASE_URL;
  const request = new NextRequest("https://tower.example.com/panel");
  expect(redirectLocation(proxy(request))).toBe("http://localhost:3000/api/auth/login");
});
```

Yeni `writers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isWriter, parseEmailList } from "./writers";

describe("writers", () => {
  it("listeyi kırpar, küçük harfe çevirir, boşları atar", () => {
    expect(parseEmailList(" Ops@Example.com, ,a@b.co ")).toEqual(new Set(["ops@example.com", "a@b.co"]));
  });

  it("tanımsız veya boş liste kimseyi yazıcı yapmaz (fail closed)", () => {
    expect(isWriter("ops@example.com", undefined)).toBe(false);
    expect(isWriter("ops@example.com", " , ")).toBe(false);
  });

  it("listedeki e-posta büyük/küçük harf duyarsız eşleşir; boş e-posta asla yazıcı değildir", () => {
    expect(isWriter("OPS@example.com", "ops@example.com")).toBe(true);
    expect(isWriter("other@example.com", "ops@example.com")).toBe(false);
    expect(isWriter("", "ops@example.com")).toBe(false);
  });
});
```

`oidc.test.ts` içindeki `sessionIdentity` bloğunu şununla değiştir (allowlist testlerini ve `parseAllowedEmails` testlerini sil, importtan `parseAllowedEmails`'i çıkar):

```ts
describe("sessionIdentity", () => {
  it("sub boş/eksikse reddeder", () => {
    expect(sessionIdentity({})).toBeNull();
    expect(sessionIdentity({ sub: "" })).toBeNull();
    expect(sessionIdentity({ sub: "   " })).toBeNull();
    expect(sessionIdentity({ sub: 42 })).toBeNull();
  });

  it("claim'lerden kimlik üretir", () => {
    expect(sessionIdentity({ sub: "u1", email: "a@example.com", name: "A" })).toEqual({
      sub: "u1",
      email: "a@example.com",
      name: "A",
    });
  });

  it("doğrulanmamış e-postayı oturuma taşımaz (yazıcı kontrolü boş e-postayı reddeder)", () => {
    expect(sessionIdentity({ sub: "u1", email: "ops@example.com", email_verified: false })).toEqual({
      sub: "u1",
      email: "",
      name: "",
    });
  });
});
```

- [ ] **Step 2: Çalıştır, FAIL gör**

Run: `pnpm --filter @tower/web test -- session proxy writers oidc`
Expected: FAIL — `writers` modülü yok, `sessionIdentity` iki parametre bekliyor, SHA-256 testi başarısız, proxy request.url'i kullanıyor.

- [ ] **Step 3: Uygula**

`apps/web/src/server/base-url.ts`:

```ts
/**
 * Uygulamanın dış adresi. Yönlendirmeler ve çerez `secure` bayrağı bundan
 * türetilir — gelen isteğin Host başlığından (request.url) DEĞİL.
 * openid-client içermez: proxy'den güvenle import edilir.
 */
export function baseUrl(): string {
  return (process.env.TOWER_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** `path`'i TOWER_BASE_URL üzerine kurar (ör. "/giris-hatasi?durum=cikis"). */
export function appUrl(path: string): URL {
  return new URL(path, `${baseUrl()}/`);
}
```

`oidc.ts`: satır 17-29'daki `baseUrl`/`appUrl` tanımlarını sil, yerine:

```ts
import { appUrl, baseUrl } from "./base-url";
export { appUrl, baseUrl };
```

`parseAllowedEmails` fonksiyonunu ve doc yorumunu sil. `sessionIdentity`'yi şununla değiştir:

```ts
/**
 * ID token claim'lerinden oturum kimliği üretir; giriş reddedilecekse null döner.
 * - `sub` boş/eksikse reddedilir.
 * - Giriş yetkisi NexAuth'taki uygulama grant'idir; burada allowlist yoktur.
 * - `email_verified === false` ise e-posta oturuma taşınmaz: yazıcı kontrolü
 *   (isWriter) boş e-postayı her zaman reddeder.
 */
export function sessionIdentity(claims: Record<string, unknown>): SessionIdentity | null {
  const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
  if (!sub) return null;
  const verified = claims.email_verified !== false;
  const email = verified && typeof claims.email === "string" ? claims.email.trim() : "";
  const name = verified && typeof claims.name === "string" ? claims.name : "";
  return { sub, email, name };
}
```

`callback/route.ts:40`:

```ts
const identity = sessionIdentity(claims);
```

`writers.ts`:

```ts
/** Virgülle ayrılmış e-posta listesi; kırpılmış, küçük harf, boşlar atılmış. */
export function parseEmailList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** TOWER_WRITER_EMAILS boş/tanımsızsa kimse yazamaz (fail closed). */
export function isWriter(email: string, raw: string | undefined): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return parseEmailList(raw).has(normalized);
}
```

`session.ts` satır 18-22 (`keyFrom`) ve importlar:

```ts
import { createHash } from "node:crypto";
// ...
/** Anahtar sırrın TAMAMINDAN SHA-256 ile türetilir (kesme yok). */
function keyFrom(secret: string): Uint8Array {
  if (new TextEncoder().encode(secret).length < 32) {
    throw new Error("TOWER_SESSION_SECRET en az 32 bayt olmalı");
  }
  return new Uint8Array(createHash("sha256").update(secret, "utf8").digest());
}
```

`proxy.ts`: import ekle `import { appUrl } from "@/server/base-url";` ve yönlendirme satırını değiştir:

```ts
return NextResponse.redirect(appUrl("/api/auth/login"));
```

- [ ] **Step 4: `TOWER_ALLOWED_EMAILS` kalıntısı kalmadığını doğrula**

Run: `grep -rn "ALLOWED_EMAILS\|parseAllowedEmails" apps/web/src docs/superpowers/specs/2026-09-22* CLAUDE.md`
Expected: çıktı yok (Faz 1 spec'i tarihsel belge, dokunulmaz).

- [ ] **Step 5: Çalıştır, PASS gör**

Run: `pnpm --filter @tower/web test && pnpm --filter @tower/web typecheck`
Expected: PASS. Not: mevcut oturumlar geçersiz olur (anahtar değişti) — beklenen.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "fix(web): SHA-256 session key, base-URL login redirect, drop email allowlist, add writer list"
```

---

### Task 3: `@tower/coolify/write` — yazma istemcisi ve `createBackupSchedule`

**Files:**
- Create: `packages/coolify/src/segment.ts`, `packages/coolify/src/write.ts`, `packages/coolify/src/write.test.ts`
- Modify: `packages/coolify/src/http.ts`, `packages/coolify/src/api.ts:48-64` (seg taşınır), `packages/coolify/package.json` (`exports`)
- Modify: `apps/web/src/server/bundle-safety.test.ts:9` (yasak import listesi)

**Interfaces:**
- Consumes: `CoolifyConfig`, `Result`, `err`, `ok`, `maskSecrets` (mevcut).
- Produces (`@tower/coolify/write`):
  ```ts
  export type CoolifyWriteHttp = CoolifyHttp & {
    post<T>(path: string, body: unknown): Promise<Result<T>>;
  };
  export function createWriteClient(config: CoolifyConfig, fetchImpl?: typeof fetch): CoolifyWriteHttp;
  export type BackupScheduleInput = { frequency: string; s3StorageUuid: string; keepLocal: number; keepS3: number };
  export function backupScheduleBody(input: BackupScheduleInput): Record<string, unknown>;
  export function createBackupSchedule(http: CoolifyWriteHttp, databaseUuid: string, input: BackupScheduleInput): Promise<Result<{ uuid: string }>>;
  ```
  `@tower/coolify` (kök) bunların HİÇBİRİNİ dışa aktarmaz.

- [ ] **Step 1: Failing test** — `write.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import * as root from "./index";
import { backupScheduleBody, createBackupSchedule, createWriteClient } from "./write";

const config = { baseUrl: "https://panel.example.app", token: "t0ken" };
const input = { frequency: "0 3 * * *", s3StorageUuid: "ys1gbsu8rpv8pau8alksmfji", keepLocal: 7, keepS3: 30 };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("@tower/coolify/write", () => {
  it("kök giriş yazma metodlarını dışa aktarmaz", () => {
    expect("createBackupSchedule" in root).toBe(false);
    expect("createWriteClient" in root).toBe(false);
  });

  it("preset'i Coolify gövdesine çevirir", () => {
    expect(backupScheduleBody(input)).toEqual({
      frequency: "0 3 * * *",
      enabled: true,
      save_s3: true,
      s3_storage_uuid: "ys1gbsu8rpv8pau8alksmfji",
      database_backup_retention_amount_locally: 7,
      database_backup_retention_amount_s3: 30,
    });
  });

  it("POST ile JSON gövde gönderir ve oluşan uuid'i döner", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ uuid: "b-1", message: "ok" }, 201));
    const http = createWriteClient(config, fetchImpl as unknown as typeof fetch);
    const r = await createBackupSchedule(http, "db-1", input);

    expect(r).toEqual({ ok: true, value: { uuid: "b-1" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://panel.example.app/api/v1/databases/db-1/backups");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual(backupScheduleBody(input));
  });

  it("geçersiz uuid'de ağa hiç gitmez", async () => {
    const fetchImpl = vi.fn();
    const http = createWriteClient(config, fetchImpl as unknown as typeof fetch);
    const r = await createBackupSchedule(http, "../../servers", input);
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("422'yi durum koduyla malformed döner", async () => {
    const http = createWriteClient(config, (async () => jsonResponse({ message: "invalid" }, 422)) as unknown as typeof fetch);
    const r = await createBackupSchedule(http, "db-1", input);
    expect(r).toMatchObject({ ok: false, error: { kind: "malformed", status: 422 } });
  });

  it("cevapta uuid yoksa malformed döner", async () => {
    const http = createWriteClient(config, (async () => jsonResponse({ message: "ok" }, 201)) as unknown as typeof fetch);
    const r = await createBackupSchedule(http, "db-1", input);
    expect(r).toMatchObject({ ok: false, error: { kind: "malformed" } });
  });

  it("ağ hatasında unreachable döner ve token'ı mesaja sızdırmaz", async () => {
    const http = createWriteClient(config, (async () => {
      throw new Error("boom t0ken");
    }) as unknown as typeof fetch);
    const r = await createBackupSchedule(http, "db-1", input);
    expect(r).toMatchObject({ ok: false, error: { kind: "unreachable" } });
    if (!r.ok) expect(r.error.message).not.toContain("t0ken");
  });
});
```

- [ ] **Step 2: Çalıştır, FAIL gör**

Run: `pnpm --filter @tower/coolify test -- write`
Expected: FAIL — `./write` bulunamadı.

- [ ] **Step 3: `seg`'i ayrı modüle taşı** — `segment.ts`:

```ts
import { err, ok, type Result } from "./result";

const UUID_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * `uuid` bir Coolify kimliği biçimine uyuyor mu diye doğrular ve uyuyorsa
 * URL'e güvenle gömülebilecek kodlanmış hâlini döner. Uymuyorsa AĞA HİÇ
 * GİTMEDEN hata döner — path/query enjeksiyonunu (ör. `../../v2/servers`,
 * `abc?x=1`) engeller. Kullanıcı denetimli her `uuid` path parçası bu
 * fonksiyondan geçmeden istemciye verilmemelidir.
 */
export function seg(uuid: string): Result<string> {
  if (!UUID_SEGMENT.test(uuid)) {
    return err("not_found", "Geçersiz kaynak tanımlayıcı");
  }
  return ok(encodeURIComponent(uuid));
}
```

`api.ts`'ten `UUID_SEGMENT` ve `seg` tanımını (satır ~48-64) sil, başa `import { seg } from "./segment";` ekle.

- [ ] **Step 4: `http.ts`'i genelleştir** — dosyanın tamamını şununla değiştir (davranış `get` için aynı):

```ts
import type { CoolifyConfig } from "./config";
import { err, ok, type Result } from "./result";
import { maskSecrets } from "./mask";

const TIMEOUT_MS = 20_000;

export type CoolifyHttp = {
  get<T>(path: string): Promise<Result<T>>;
};

/** Yalnızca `@tower/coolify/write` üzerinden erişilir; kök giriş bu tipi dışa aktarmaz. */
export type CoolifyWriteHttp = CoolifyHttp & {
  post<T>(path: string, body: unknown): Promise<Result<T>>;
};

type Method = "GET" | "POST";

function requester(config: CoolifyConfig, fetchImpl: typeof fetch) {
  return async function send<T>(method: Method, path: string, body?: unknown): Promise<Result<T>> {
    const url = `${config.baseUrl}/api/v1${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await request<T>(method, url, path, body, controller.signal);
    } finally {
      // Zaman aşımı gövde okumasını (response.json()) da kapsar.
      clearTimeout(timer);
    }
  };

  async function request<T>(
    method: Method,
    url: string,
    path: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<Result<T>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch {
      // Hata nesnesi taşınmaz: token içeren istek bağlamı sızabilir.
      return err("unreachable", maskSecrets(`Coolify'a ulaşılamadı: ${path}`));
    }

    if (response.status === 401 || response.status === 403) {
      return err("unauthorized", maskSecrets("Coolify token'ı reddedildi"), response.status);
    }
    if (response.status === 404) {
      return err("not_found", maskSecrets(`Kaynak bulunamadı: ${path}`), 404);
    }
    if (response.status === 429) {
      return err("rate_limited", maskSecrets("Coolify istek sınırı aşıldı"), 429);
    }
    if (!response.ok) {
      return err("malformed", maskSecrets(`Beklenmeyen durum kodu: ${response.status}`), response.status);
    }

    try {
      return ok((await response.json()) as T);
    } catch {
      return err("malformed", maskSecrets(`Cevap JSON değil: ${path}`));
    }
  }
}

export function createClient(config: CoolifyConfig, fetchImpl: typeof fetch = fetch): CoolifyHttp {
  const send = requester(config, fetchImpl);
  return { get: (path) => send("GET", path) };
}

export function createWriteClient(
  config: CoolifyConfig,
  fetchImpl: typeof fetch = fetch,
): CoolifyWriteHttp {
  const send = requester(config, fetchImpl);
  return {
    get: (path) => send("GET", path),
    post: (path, body) => send("POST", path, body),
  };
}
```

Mevcut `http.test.ts` içinde `fetchImpl`'e gelen `init`'i birebir karşılaştıran bir test varsa (`headers` nesnesi), yeni `method`/`body` alanları için `toMatchObject` kullanacak şekilde güncelle.

- [ ] **Step 5: `write.ts`**

```ts
/**
 * @tower/coolify/write — Coolify'a YAZAN tek giriş.
 * Kök giriş (@tower/coolify) bu modülü dışa aktarmaz; yalnızca apps/web
 * içindeki performWrite geçidi buradan import eder.
 */
import type { CoolifyWriteHttp } from "./http";
import { err, ok, type Result } from "./result";
import { seg } from "./segment";

export type { CoolifyWriteHttp } from "./http";
export { createWriteClient } from "./http";

export type BackupScheduleInput = {
  frequency: string;
  s3StorageUuid: string;
  keepLocal: number;
  keepS3: number;
};

/** Coolify 4.3.23 `POST /databases/{uuid}/backups` gövdesi. */
export function backupScheduleBody(input: BackupScheduleInput): Record<string, unknown> {
  return {
    frequency: input.frequency,
    enabled: true,
    save_s3: true,
    s3_storage_uuid: input.s3StorageUuid,
    database_backup_retention_amount_locally: input.keepLocal,
    database_backup_retention_amount_s3: input.keepS3,
  };
}

export async function createBackupSchedule(
  http: CoolifyWriteHttp,
  databaseUuid: string,
  input: BackupScheduleInput,
): Promise<Result<{ uuid: string }>> {
  const id = seg(databaseUuid);
  if (!id.ok) return id;
  const r = await http.post<unknown>(`/databases/${id.value}/backups`, backupScheduleBody(input));
  if (!r.ok) return r;
  const uuid = (r.value as { uuid?: unknown } | null)?.uuid;
  if (typeof uuid !== "string" || uuid === "") {
    return err("malformed", "Yedek programı oluşturuldu ama cevapta uuid yok");
  }
  return ok({ uuid });
}
```

`packages/coolify/package.json` `exports`:

```json
"exports": {
  ".": "./src/index.ts",
  "./write": "./src/write.ts"
}
```

`index.ts`'e DOKUNMA (yazma dışa aktarılmaz).

- [ ] **Step 6: Bundle-safety'yi genişlet** — `apps/web/src/server/bundle-safety.test.ts:9`:

```ts
const FORBIDDEN_IMPORT =
  /(?:from\s+|import\s*\(\s*|import\s+)["'](@tower\/coolify(?:\/write)?|@tower\/db|@\/server\/[^"']*|server-only)["']/g;
```

Ve ilk testteki sahte dosyaya bir satır + beklenen ihlal ekle:

```ts
'import { createBackupSchedule } from "@tower/coolify/write";',
// beklenen listeye:
"fake.tsx -> import @tower/coolify/write",
```

(Beklenen dizideki sıra: `COOLIFY_TOKEN`, sonra importlar kaynaktaki sırayla.)

- [ ] **Step 7: Çalıştır, PASS gör**

Run: `pnpm --filter @tower/coolify test && pnpm --filter @tower/coolify typecheck && pnpm --filter @tower/web test -- bundle-safety`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/coolify apps/web/src/server/bundle-safety.test.ts
git commit -m "feat(coolify): @tower/coolify/write entry with createBackupSchedule"
```

---

### Task 4: `@tower/db` — şema, migration, store

**Files:**
- Create: `packages/db/package.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `drizzle.config.ts`, `src/schema.ts`, `src/store.ts`, `src/migrate.ts`, `src/index.ts`, `scripts/migrate.ts`, `scripts/test-db.sh`, `src/store.integration.test.ts`, `drizzle/` (üretilir)
- Modify: `apps/web/package.json` (dep), `apps/web/next.config.ts:31` (`transpilePackages`)

**Interfaces:**
- Produces (`@tower/db`):
  ```ts
  export type AuditAction = "backup.create" | "backup.protect_all" | "preset.update";
  export type AuditStatus = "pending" | "ok" | "failed";
  export type NewAudit = { actorEmail: string; action: AuditAction; target: string | null; payload: unknown; parentId?: string | null };
  export type AuditFinish = { status: "ok" | "failed"; errorKind?: string | null; result?: unknown };
  export type AuditRow = { id: string; actorEmail: string; action: string; target: string | null; payload: unknown; status: AuditStatus; errorKind: string | null; result: unknown; parentId: string | null; createdAt: Date; finishedAt: Date | null };
  export type BackupPreset = { frequency: string; keepLocal: number; keepS3: number; s3StorageUuid: string | null; updatedBy: string | null; updatedAt: Date | null };
  export const DEFAULT_PRESET: BackupPreset;
  export interface TowerStore {
    appendAudit(entry: NewAudit): Promise<string>;           // yeni satırın id'si
    finishAudit(id: string, finish: AuditFinish): Promise<void>;
    listAudit(limit: number): Promise<AuditRow[]>;             // created_at DESC
    getBackupPreset(): Promise<BackupPreset>;                  // satır yoksa DEFAULT_PRESET
    upsertBackupPreset(preset: Omit<BackupPreset, "updatedAt">): Promise<void>;
    close(): Promise<void>;
  }
  export function createStore(url: string): TowerStore;
  export function runMigrations(url: string): Promise<void>;
  ```

- [ ] **Step 1: Paket iskeleti**

```bash
mkdir -p packages/db/src packages/db/scripts
cp packages/coolify/tsconfig.json packages/coolify/eslint.config.mjs packages/coolify/vitest.config.ts packages/db/
```

`packages/db/tsconfig.json` içinde `include`'u `["src/**/*.ts", "scripts/**/*.ts", "drizzle.config.ts"]` yap.

`packages/db/package.json`:

```json
{
  "name": "@tower/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "lint": "eslint src scripts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:db": "bash scripts/test-db.sh",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx --env-file=../../.env.local scripts/migrate.ts"
  }
}
```

```bash
pnpm --filter @tower/db add drizzle-orm postgres
pnpm --filter @tower/db add -D drizzle-kit tsx typescript vitest eslint typescript-eslint @types/node
```

- [ ] **Step 2: Şema** — `src/schema.ts`:

```ts
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull(),
    errorKind: text("error_kind"),
    result: jsonb("result"),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("audit_log_created_at_idx").on(t.createdAt)],
);

/** Tek satır (id = 1). */
export const backupPreset = pgTable("backup_preset", {
  id: integer("id").primaryKey(),
  frequency: text("frequency").notNull().default("0 3 * * *"),
  keepLocal: integer("keep_local").notNull().default(7),
  keepS3: integer("keep_s3").notNull().default(30),
  s3StorageUuid: text("s3_storage_uuid"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});
```

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
```

Run: `pnpm --filter @tower/db db:generate`
Expected: `packages/db/drizzle/0000_*.sql` ve `drizzle/meta/` oluşur; SQL'de `CREATE TABLE "audit_log"` ve `CREATE TABLE "backup_preset"` var.

- [ ] **Step 3: Failing entegrasyon testi** — `src/store.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStore, DEFAULT_PRESET, runMigrations, type TowerStore } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.warn("[@tower/db] TEST_DATABASE_URL yok — entegrasyon testleri ATLANDI. Çalıştırmak için: pnpm --filter @tower/db test:db");
}

describe.skipIf(!url)("TowerStore (Postgres)", () => {
  let store: TowerStore;

  beforeAll(async () => {
    await runMigrations(url!);
    store = createStore(url!);
  });
  afterAll(async () => {
    await store?.close();
  });

  it("appendAudit pending satır yazar, finishAudit kapatır", async () => {
    const id = await store.appendAudit({
      actorEmail: "ops@example.com",
      action: "backup.create",
      target: "db-1",
      payload: { frequency: "0 3 * * *" },
    });
    await store.finishAudit(id, { status: "ok", result: { uuid: "b-1" } });

    const [row] = (await store.listAudit(50)).filter((r) => r.id === id);
    expect(row).toMatchObject({
      actorEmail: "ops@example.com",
      action: "backup.create",
      target: "db-1",
      status: "ok",
      errorKind: null,
      result: { uuid: "b-1" },
      parentId: null,
    });
    expect(row.finishedAt).toBeInstanceOf(Date);
  });

  it("çocuk satır ebeveyne bağlanır", async () => {
    const parent = await store.appendAudit({ actorEmail: "a@b.co", action: "backup.protect_all", target: null, payload: {} });
    const child = await store.appendAudit({ actorEmail: "a@b.co", action: "backup.create", target: "db-2", payload: {}, parentId: parent });
    const [row] = (await store.listAudit(50)).filter((r) => r.id === child);
    expect(row.parentId).toBe(parent);
  });

  it("preset yoksa varsayılanı döner, upsert sonrası yenisini döner", async () => {
    expect(await store.getBackupPreset()).toMatchObject({ frequency: DEFAULT_PRESET.frequency, keepLocal: 7, keepS3: 30 });
    await store.upsertBackupPreset({ frequency: "0 4 * * *", keepLocal: 5, keepS3: 20, s3StorageUuid: "s3-1", updatedBy: "a@b.co" });
    await store.upsertBackupPreset({ frequency: "0 2 * * *", keepLocal: 5, keepS3: 20, s3StorageUuid: "s3-1", updatedBy: "a@b.co" });
    const p = await store.getBackupPreset();
    expect(p).toMatchObject({ frequency: "0 2 * * *", s3StorageUuid: "s3-1", updatedBy: "a@b.co" });
    expect(p.updatedAt).toBeInstanceOf(Date);
  });
});
```

`scripts/test-db.sh`:

```bash
#!/usr/bin/env bash
# Geçici Postgres 17 ile @tower/db entegrasyon testlerini çalıştırır.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  echo "[@tower/db] Docker yok — entegrasyon testleri çalıştırılamadı." >&2
  exit 1
fi

NAME="tower-db-test-$$"
PORT=55432
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=tower_test -p "$PORT:5432" postgres:17 >/dev/null
trap 'docker stop "$NAME" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U postgres -d tower_test >/dev/null 2>&1 && break
  sleep 1
done

TEST_DATABASE_URL="postgres://postgres:test@127.0.0.1:$PORT/tower_test" pnpm exec vitest run
```

Run: `pnpm --filter @tower/db test:db`
Expected: FAIL — `./index` bulunamadı.

- [ ] **Step 4: Uygula**

`src/migrate.ts`:

```ts
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const MIGRATIONS = path.join(import.meta.dirname, "..", "drizzle");

export async function runMigrations(url: string): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS });
  } finally {
    await sql.end();
  }
}
```

`src/store.ts`:

```ts
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { auditLog, backupPreset } from "./schema";

export type AuditAction = "backup.create" | "backup.protect_all" | "preset.update";
export type AuditStatus = "pending" | "ok" | "failed";

export type NewAudit = {
  actorEmail: string;
  action: AuditAction;
  target: string | null;
  payload: unknown;
  parentId?: string | null;
};

export type AuditFinish = { status: "ok" | "failed"; errorKind?: string | null; result?: unknown };

export type AuditRow = {
  id: string;
  actorEmail: string;
  action: string;
  target: string | null;
  payload: unknown;
  status: AuditStatus;
  errorKind: string | null;
  result: unknown;
  parentId: string | null;
  createdAt: Date;
  finishedAt: Date | null;
};

export type BackupPreset = {
  frequency: string;
  keepLocal: number;
  keepS3: number;
  s3StorageUuid: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
};

export const DEFAULT_PRESET: BackupPreset = {
  frequency: "0 3 * * *",
  keepLocal: 7,
  keepS3: 30,
  s3StorageUuid: null,
  updatedBy: null,
  updatedAt: null,
};

export interface TowerStore {
  appendAudit(entry: NewAudit): Promise<string>;
  finishAudit(id: string, finish: AuditFinish): Promise<void>;
  listAudit(limit: number): Promise<AuditRow[]>;
  getBackupPreset(): Promise<BackupPreset>;
  upsertBackupPreset(preset: Omit<BackupPreset, "updatedAt">): Promise<void>;
  close(): Promise<void>;
}

const PRESET_ID = 1;

export function createStore(url: string): TowerStore {
  const sql = postgres(url, { max: 5 });
  const db = drizzle(sql);

  return {
    async appendAudit(entry) {
      const [row] = await db
        .insert(auditLog)
        .values({
          actorEmail: entry.actorEmail,
          action: entry.action,
          target: entry.target,
          payload: entry.payload ?? {},
          status: "pending",
          parentId: entry.parentId ?? null,
        })
        .returning({ id: auditLog.id });
      return row.id;
    },

    async finishAudit(id, finish) {
      await db
        .update(auditLog)
        .set({
          status: finish.status,
          errorKind: finish.errorKind ?? null,
          result: finish.result ?? null,
          finishedAt: new Date(),
        })
        .where(eq(auditLog.id, id));
    },

    async listAudit(limit) {
      const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
      return rows.map((r) => ({ ...r, status: r.status as AuditStatus }));
    },

    async getBackupPreset() {
      const [row] = await db.select().from(backupPreset).where(eq(backupPreset.id, PRESET_ID));
      if (!row) return DEFAULT_PRESET;
      const { id: _id, ...preset } = row;
      return preset;
    },

    async upsertBackupPreset(preset) {
      const values = { ...preset, updatedAt: new Date() };
      await db
        .insert(backupPreset)
        .values({ id: PRESET_ID, ...values })
        .onConflictDoUpdate({ target: backupPreset.id, set: values });
    },

    async close() {
      await sql.end();
    },
  };
}
```

(`_id` kullanılmayan değişken uyarısı verirse `// eslint-disable-next-line @typescript-eslint/no-unused-vars` ekle.)

`src/index.ts`:

```ts
export type { AuditAction, AuditFinish, AuditRow, AuditStatus, BackupPreset, NewAudit, TowerStore } from "./store";
export { createStore, DEFAULT_PRESET } from "./store";
export { runMigrations } from "./migrate";
```

`scripts/migrate.ts`:

```ts
import { runMigrations } from "../src/migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL tanımlı değil");
  process.exit(1);
}
await runMigrations(url);
console.log("migration tamam");
```

- [ ] **Step 5: Çalıştır, PASS gör**

Run: `pnpm --filter @tower/db test:db`
Expected: 3 test PASS.

Run: `pnpm --filter @tower/db test`
Expected: testler atlandı + `TEST_DATABASE_URL yok — entegrasyon testleri ATLANDI` uyarısı; çıkış kodu 0.

- [ ] **Step 6: Web'e bağla**

```bash
pnpm --filter @tower/web add @tower/db@workspace:*
```

`apps/web/next.config.ts:31`:

```ts
transpilePackages: ["@tower/coolify", "@tower/db"],
```

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS (henüz web tarafında import yok; build paket çözümünü doğrular).

- [ ] **Step 7: Commit**

```bash
git add packages/db apps/web/package.json apps/web/next.config.ts pnpm-lock.yaml
git commit -m "feat(db): @tower/db with audit_log, backup_preset, migrations"
```

---

### Task 5: `performWrite` geçidi, store tekili, dashboard önbelleğini boşaltma

**Files:**
- Create: `apps/web/src/server/store.ts`, `apps/web/src/server/write.ts`, `apps/web/src/server/write.test.ts`
- Modify: `apps/web/src/server/dashboard.ts:178-235`
- Test: `apps/web/src/server/dashboard.test.ts`

**Interfaces:**
- Consumes: `TowerStore`, `AuditAction` (`@tower/db`); `redactJson`, `CoolifyErrorKind` (`@tower/coolify`); `isWriter` (`@/server/writers`).
- Produces:
  ```ts
  // @/server/write
  export type WriteErrorKind = CoolifyErrorKind | "forbidden" | "db" | "needs_s3" | "partial";
  export type WriteError = { kind: WriteErrorKind; message: string };
  export type StepResult<T> = { ok: true; value: T } | { ok: false; error: WriteError };
  export type WriteOutcome<T> = { ok: true; value: T; auditId: string } | { ok: false; error: WriteError; auditId?: string };
  export type WriteDeps = { store: TowerStore | null; writers: string | undefined };
  export type WriteRequest = { actorEmail: string; action: AuditAction; target: string | null; payload: unknown; parentId?: string | null };
  export function performWrite<T>(deps: WriteDeps, req: WriteRequest, fn: (auditId: string) => Promise<StepResult<T>>): Promise<WriteOutcome<T>>;
  // @/server/store
  export function getStore(): TowerStore | null;   // DATABASE_URL yoksa null
  // @/server/dashboard
  export type DashboardLoader = DashboardFetcher & { invalidate(): void };
  export const loadDashboard: DashboardLoader;
  ```

- [ ] **Step 1: Failing testler** — `write.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { TowerStore } from "@tower/db";
import { performWrite } from "./write";

function fakeStore(overrides: Partial<TowerStore> = {}) {
  const calls: { append: unknown[]; finish: unknown[] } = { append: [], finish: [] };
  const store: TowerStore = {
    appendAudit: vi.fn(async (e) => {
      calls.append.push(e);
      return `audit-${calls.append.length}`;
    }),
    finishAudit: vi.fn(async (id, f) => {
      calls.finish.push({ id, ...f });
    }),
    listAudit: vi.fn(async () => []),
    getBackupPreset: vi.fn(),
    upsertBackupPreset: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
  return { store, calls };
}

const req = { actorEmail: "ops@example.com", action: "backup.create" as const, target: "db-1", payload: { a: 1 } };
const writers = "ops@example.com";

describe("performWrite", () => {
  it("yazıcı değilse forbidden döner; denetim satırı yazmaz, fn çağrılmaz", async () => {
    const { store, calls } = fakeStore();
    const fn = vi.fn();
    const r = await performWrite({ store, writers }, { ...req, actorEmail: "x@example.com" }, fn);
    expect(r).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(calls.append).toHaveLength(0);
    expect(fn).not.toHaveBeenCalled();
  });

  it("store yoksa (DATABASE_URL tanımsız) db hatası döner, fn çağrılmaz", async () => {
    const fn = vi.fn();
    const r = await performWrite({ store: null, writers }, req, fn);
    expect(r).toMatchObject({ ok: false, error: { kind: "db" } });
    expect(fn).not.toHaveBeenCalled();
  });

  it("denetim insert'i patlarsa db hatası döner, fn çağrılmaz (fail closed)", async () => {
    const { store } = fakeStore({ appendAudit: vi.fn(async () => { throw new Error("conn refused"); }) });
    const fn = vi.fn();
    const r = await performWrite({ store, writers }, req, fn);
    expect(r).toMatchObject({ ok: false, error: { kind: "db" } });
    expect(fn).not.toHaveBeenCalled();
  });

  it("başarıda pending → ok yazar, auditId'yi fn'e verir", async () => {
    const { store, calls } = fakeStore();
    const fn = vi.fn(async (auditId: string) => ({ ok: true as const, value: { uuid: "b-1", auditId } }));
    const r = await performWrite({ store, writers }, req, fn);
    expect(r).toEqual({ ok: true, value: { uuid: "b-1", auditId: "audit-1" }, auditId: "audit-1" });
    expect(calls.append[0]).toMatchObject({ actorEmail: "ops@example.com", action: "backup.create", target: "db-1" });
    expect(calls.finish[0]).toMatchObject({ id: "audit-1", status: "ok", errorKind: null });
  });

  it("fn hatasında failed + error_kind yazar", async () => {
    const { store, calls } = fakeStore();
    const r = await performWrite({ store, writers }, req, async () => ({
      ok: false,
      error: { kind: "unreachable", message: "Coolify'a ulaşılamadı" },
    }));
    expect(r).toMatchObject({ ok: false, error: { kind: "unreachable" }, auditId: "audit-1" });
    expect(calls.finish[0]).toMatchObject({ status: "failed", errorKind: "unreachable" });
  });

  it("fn throw ederse failed yazar ve hatayı sonuç olarak döner", async () => {
    const { store, calls } = fakeStore();
    const r = await performWrite({ store, writers }, req, async () => {
      throw new Error("beklenmedik");
    });
    expect(r).toMatchObject({ ok: false, error: { kind: "malformed" } });
    expect(calls.finish[0]).toMatchObject({ status: "failed", errorKind: "malformed" });
  });

  it("payload ve result redactJson'dan geçer", async () => {
    const { store, calls } = fakeStore();
    await performWrite({ store, writers }, { ...req, payload: { secret: "x", frequency: "0 3 * * *" } }, async () => ({
      ok: true,
      value: { token: "y" },
    }));
    expect(calls.append[0]).toMatchObject({ payload: { secret: "***", frequency: "0 3 * * *" } });
    expect(calls.finish[0]).toMatchObject({ result: { token: "***" } });
  });

  it("finishAudit patlarsa yine de işlemin sonucunu döner (yazma gerçekleşti)", async () => {
    const { store } = fakeStore({ finishAudit: vi.fn(async () => { throw new Error("db down"); }) });
    const r = await performWrite({ store, writers }, req, async () => ({ ok: true, value: 1 }));
    expect(r).toMatchObject({ ok: true, value: 1 });
  });
});
```

`dashboard.test.ts`'e ekle (mevcut `createDashboardLoader` testlerinin yanına; saat taklidi mevcut testlerdeki gibi):

```ts
it("invalidate() TTL içindeki memo'yu boşaltır, sonraki çağrı ağa gider", async () => {
  let now = 0;
  const fetch = vi.fn(async () => okData);
  const load = createDashboardLoader(fetch, 10_000, () => now);
  await load();
  now = 1_000;
  load.invalidate();
  await load();
  expect(fetch).toHaveBeenCalledTimes(2);
});
```

(`okData` bu dosyadaki mevcut başarılı `DashboardData` sabitidir, satır 122.)

- [ ] **Step 2: Çalıştır, FAIL gör**

Run: `pnpm --filter @tower/web test -- write dashboard`
Expected: FAIL — `./write` yok, `invalidate` yok.

- [ ] **Step 3: Uygula**

`store.ts`:

```ts
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
```

`write.ts`:

```ts
import "server-only";
import { redactJson, type CoolifyErrorKind } from "@tower/coolify";
import type { AuditAction, TowerStore } from "@tower/db";
import { isWriter } from "./writers";

export type WriteErrorKind = CoolifyErrorKind | "forbidden" | "db" | "needs_s3" | "partial";
export type WriteError = { kind: WriteErrorKind; message: string };
export type StepResult<T> = { ok: true; value: T } | { ok: false; error: WriteError };
export type WriteOutcome<T> =
  | { ok: true; value: T; auditId: string }
  | { ok: false; error: WriteError; auditId?: string };

export type WriteDeps = { store: TowerStore | null; writers: string | undefined };

export type WriteRequest = {
  actorEmail: string;
  action: AuditAction;
  target: string | null;
  payload: unknown;
  parentId?: string | null;
};

/**
 * Tüm yazmaların TEK geçidi. Sıra sabittir:
 * 1) yazıcı değilse forbidden (denetim satırı yok — hiçbir şey denenmedi),
 * 2) denetim satırı `pending` — yazılamazsa `db` hatası ve fn ÇAĞRILMAZ,
 * 3) fn(auditId),
 * 4) denetim satırı `ok | failed`. Bu adım patlarsa yazma zaten gerçekleşmiştir;
 *    sonuç yine döner, satır `pending` kalır ve /denetim "yarıda kaldı" gösterir.
 */
export async function performWrite<T>(
  deps: WriteDeps,
  req: WriteRequest,
  fn: (auditId: string) => Promise<StepResult<T>>,
): Promise<WriteOutcome<T>> {
  if (!isWriter(req.actorEmail, deps.writers)) {
    return { ok: false, error: { kind: "forbidden", message: "Bu işlem için yazma yetkiniz yok." } };
  }
  if (!deps.store) {
    return { ok: false, error: { kind: "db", message: "DATABASE_URL tanımlı değil; yazma kapalı." } };
  }

  let auditId: string;
  try {
    auditId = await deps.store.appendAudit({
      actorEmail: req.actorEmail,
      action: req.action,
      target: req.target,
      payload: redactJson(req.payload),
      parentId: req.parentId ?? null,
    });
  } catch {
    return { ok: false, error: { kind: "db", message: "Denetim kaydı yazılamadı; işlem yapılmadı." } };
  }

  let result: StepResult<T>;
  try {
    result = await fn(auditId);
  } catch {
    result = { ok: false, error: { kind: "malformed", message: "İşlem beklenmedik şekilde durdu." } };
  }

  try {
    await deps.store.finishAudit(
      auditId,
      result.ok
        ? { status: "ok", errorKind: null, result: redactJson(result.value) }
        : { status: "failed", errorKind: result.error.kind, result: null },
    );
  } catch {
    console.error(`[tower] denetim satırı kapatılamadı: ${auditId}`);
  }

  return result.ok ? { ok: true, value: result.value, auditId } : { ok: false, error: result.error, auditId };
}
```

`dashboard.ts`: `createDashboardLoader` dönüşünü değiştir:

```ts
export type DashboardLoader = DashboardFetcher & { invalidate(): void };

export function createDashboardLoader(
  fetch: DashboardFetcher,
  ttlMs: number = DASHBOARD_TTL_MS,
  clock: Clock = () => Date.now(),
): DashboardLoader {
  // ... goodCache / memoCache / inflight / refresh aynen kalır ...

  function load(): Promise<DashboardData> {
    const now = clock();
    if (memoCache && now - memoCache.fetchedAt < ttlMs) {
      return Promise.resolve(memoCache.data);
    }
    inflight ??= refresh().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  /** Yazmadan sonra çağrılır: memo boşalır, bir sonraki okuma ağa gider (goodCache korunur). */
  load.invalidate = () => {
    memoCache = null;
  };

  return load;
}

export const loadDashboard: DashboardLoader = createDashboardLoader(fetchDashboardData);
```

- [ ] **Step 4: Çalıştır, PASS gör**

Run: `pnpm --filter @tower/web test && pnpm --filter @tower/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server
git commit -m "feat(web): performWrite gate with fail-closed audit, dashboard invalidate"
```

---

### Task 6: Yedek iş mantığı — `enableBackup`, `protectAll`, preset ayrıştırma

**Files:**
- Create: `apps/web/src/server/backups.ts`, `apps/web/src/server/backups.test.ts`, `apps/web/src/server/preset.ts`, `apps/web/src/server/preset.test.ts`

**Interfaces:**
- Consumes: `performWrite`, `WriteDeps`, `StepResult`, `WriteError` (Task 5); `BackupPreset` (`@tower/db`); `S3Storage`, `DatabaseBackup`, `Result` (`@tower/coolify`); `BackupScheduleInput` (`@tower/coolify/write`).
- Produces:
  ```ts
  // @/server/preset
  export function presetTarget(preset: BackupPreset, storages: S3Storage[]): StepResult<BackupScheduleInput>;
  export type PresetForm = { frequency: string; keepLocal: number; keepS3: number; s3StorageUuid: string };
  export function parsePresetForm(form: FormData, usableUuids: string[]): { ok: true; value: PresetForm } | { ok: false; message: string };
  // @/server/backups
  export type BackupPorts = {
    getBackups(dbUuid: string): Promise<Result<DatabaseBackup[]>>;
    create(dbUuid: string, input: BackupScheduleInput): Promise<Result<{ uuid: string }>>;
  };
  export type RowStatus = "ok" | "failed" | "skipped";
  export type BackupRow = { uuid: string; name: string; status: RowStatus; error?: WriteError };
  export function hasActiveSchedule(backups: DatabaseBackup[]): boolean;
  export function enableBackup(deps: WriteDeps, ports: BackupPorts, actorEmail: string, db: { uuid: string; name: string }, input: BackupScheduleInput, parentId?: string): Promise<BackupRow>;
  export function protectAll(deps: WriteDeps, ports: BackupPorts, actorEmail: string, dbs: { uuid: string; name: string }[], input: BackupScheduleInput): Promise<{ outcome: WriteOutcome<BackupRow[]>; rows: BackupRow[] }>;
  ```

- [ ] **Step 1: Failing testler** — `preset.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_PRESET } from "@tower/db";
import { parsePresetForm, presetTarget } from "./preset";

const usable = { uuid: "s3-1", name: "nexstep-tower", bucket: "b", endpoint: "e", usable: true };
const broken = { ...usable, uuid: "s3-2", usable: false };

function form(v: Record<string, string>) {
  const f = new FormData();
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
}

describe("presetTarget", () => {
  it("hedef S3 yoksa needs_s3", () => {
    expect(presetTarget(DEFAULT_PRESET, [usable])).toMatchObject({ ok: false, error: { kind: "needs_s3" } });
  });
  it("hedef S3 artık kullanılamıyorsa needs_s3", () => {
    expect(presetTarget({ ...DEFAULT_PRESET, s3StorageUuid: "s3-2" }, [broken])).toMatchObject({
      ok: false,
      error: { kind: "needs_s3" },
    });
  });
  it("kullanılabilir hedefte Coolify girdisini üretir", () => {
    expect(presetTarget({ ...DEFAULT_PRESET, s3StorageUuid: "s3-1" }, [usable])).toEqual({
      ok: true,
      value: { frequency: "0 3 * * *", s3StorageUuid: "s3-1", keepLocal: 7, keepS3: 30 },
    });
  });
});

describe("parsePresetForm", () => {
  const good = { frequency: "0 3 * * *", keepLocal: "7", keepS3: "30", s3StorageUuid: "s3-1" };
  it("geçerli formu ayrıştırır", () => {
    expect(parsePresetForm(form(good), ["s3-1"])).toEqual({
      ok: true,
      value: { frequency: "0 3 * * *", keepLocal: 7, keepS3: 30, s3StorageUuid: "s3-1" },
    });
  });
  it("Coolify anahtar kelimelerini kabul eder", () => {
    expect(parsePresetForm(form({ ...good, frequency: "daily" }), ["s3-1"]).ok).toBe(true);
  });
  it("5 alanlı olmayan cron'u reddeder", () => {
    expect(parsePresetForm(form({ ...good, frequency: "0 3 * *" }), ["s3-1"]).ok).toBe(false);
  });
  it("1-365 dışı saklama sayısını reddeder", () => {
    expect(parsePresetForm(form({ ...good, keepLocal: "0" }), ["s3-1"]).ok).toBe(false);
    expect(parsePresetForm(form({ ...good, keepS3: "366" }), ["s3-1"]).ok).toBe(false);
    expect(parsePresetForm(form({ ...good, keepS3: "3.5" }), ["s3-1"]).ok).toBe(false);
  });
  it("kullanılabilir listede olmayan S3'ü reddeder", () => {
    expect(parsePresetForm(form(good), ["s3-9"]).ok).toBe(false);
  });
});
```

`backups.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { TowerStore } from "@tower/db";
import { enableBackup, hasActiveSchedule, protectAll, type BackupPorts } from "./backups";

const input = { frequency: "0 3 * * *", s3StorageUuid: "s3-1", keepLocal: 7, keepS3: 30 };
const writers = "ops@example.com";
const actor = "ops@example.com";

function store() {
  let n = 0;
  const appended: Array<Record<string, unknown>> = [];
  const finished: Array<Record<string, unknown>> = [];
  const s: TowerStore = {
    appendAudit: vi.fn(async (e) => {
      appended.push(e as Record<string, unknown>);
      return `a${++n}`;
    }),
    finishAudit: vi.fn(async (id, f) => {
      finished.push({ id, ...f });
    }),
    listAudit: vi.fn(),
    getBackupPreset: vi.fn(),
    upsertBackupPreset: vi.fn(),
    close: vi.fn(),
  };
  return { s, appended, finished };
}

function ports(existing: Record<string, boolean>, failing: string[] = []): BackupPorts {
  return {
    getBackups: vi.fn(async (uuid) => ({
      ok: true as const,
      value: existing[uuid] ? [{ uuid: "b", enabled: true, frequency: "daily", saveToS3: true }] : [],
    })),
    create: vi.fn(async (uuid) =>
      failing.includes(uuid)
        ? { ok: false as const, error: { kind: "unreachable" as const, message: "x" } }
        : { ok: true as const, value: { uuid: `sch-${uuid}` } },
    ),
  };
}

describe("hasActiveSchedule", () => {
  it("yalnızca etkin program sayılır", () => {
    expect(hasActiveSchedule([])).toBe(false);
    expect(hasActiveSchedule([{ uuid: "b", enabled: false, frequency: "daily", saveToS3: true }])).toBe(false);
    expect(hasActiveSchedule([{ uuid: "b", enabled: true, frequency: "daily", saveToS3: false }])).toBe(true);
  });
});

describe("enableBackup", () => {
  it("zaten etkin program varsa skipped; yazma ve denetim yok", async () => {
    const { s, appended } = store();
    const p = ports({ "db-1": true });
    const row = await enableBackup({ store: s, writers }, p, actor, { uuid: "db-1", name: "pg" }, input);
    expect(row).toEqual({ uuid: "db-1", name: "pg", status: "skipped" });
    expect(p.create).not.toHaveBeenCalled();
    expect(appended).toHaveLength(0);
  });

  it("programı oluşturur ve backup.create denetim satırı yazar", async () => {
    const { s, appended, finished } = store();
    const p = ports({});
    const row = await enableBackup({ store: s, writers }, p, actor, { uuid: "db-1", name: "pg" }, input);
    expect(row).toEqual({ uuid: "db-1", name: "pg", status: "ok" });
    expect(p.create).toHaveBeenCalledWith("db-1", input);
    expect(appended[0]).toMatchObject({ action: "backup.create", target: "db-1", payload: input });
    expect(finished[0]).toMatchObject({ status: "ok", result: { uuid: "sch-db-1" } });
  });

  it("yedek listesi okunamazsa denemeden failed döner", async () => {
    const { s } = store();
    const p: BackupPorts = {
      getBackups: vi.fn(async () => ({ ok: false as const, error: { kind: "unreachable" as const, message: "x" } })),
      create: vi.fn(),
    };
    const row = await enableBackup({ store: s, writers }, p, actor, { uuid: "db-1", name: "pg" }, input);
    expect(row).toMatchObject({ status: "failed", error: { kind: "unreachable" } });
    expect(p.create).not.toHaveBeenCalled();
  });
});

describe("protectAll", () => {
  const dbs = [
    { uuid: "db-1", name: "a" },
    { uuid: "db-2", name: "b" },
    { uuid: "db-3", name: "c" },
  ];

  it("sırayla işler, çocuk satırları ebeveyne bağlar, atlananı skipped sayar", async () => {
    const { s, appended, finished } = store();
    const p = ports({ "db-2": true });
    const { outcome, rows } = await protectAll({ store: s, writers }, p, actor, dbs, input);

    expect(rows.map((r) => r.status)).toEqual(["ok", "skipped", "ok"]);
    expect(outcome.ok).toBe(true);
    expect(appended[0]).toMatchObject({ action: "backup.protect_all", target: null });
    expect(appended.slice(1).every((e) => e.parentId === "a1")).toBe(true);
    expect(finished.at(-1)).toMatchObject({ id: "a1", status: "ok" });
  });

  it("bir veritabanı başarısızsa ebeveyn partial ile failed olur; diğerleri yine işlenir", async () => {
    const { s, finished } = store();
    const p = ports({}, ["db-2"]);
    const { outcome, rows } = await protectAll({ store: s, writers }, p, actor, dbs, input);
    expect(rows.map((r) => r.status)).toEqual(["ok", "failed", "ok"]);
    expect(outcome).toMatchObject({ ok: false, error: { kind: "partial" } });
    expect(finished.at(-1)).toMatchObject({ id: "a1", status: "failed", errorKind: "partial" });
  });

  it("yazıcı değilse hiçbir şey denemez", async () => {
    const { s, appended } = store();
    const p = ports({});
    const { outcome, rows } = await protectAll({ store: s, writers }, p, "x@example.com", dbs, input);
    expect(outcome).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(rows).toEqual([]);
    expect(appended).toHaveLength(0);
    expect(p.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Çalıştır, FAIL gör**

Run: `pnpm --filter @tower/web test -- backups preset`
Expected: FAIL — modüller yok.

- [ ] **Step 3: Uygula** — `preset.ts`:

```ts
import type { S3Storage } from "@tower/coolify";
import type { BackupScheduleInput } from "@tower/coolify/write";
import type { BackupPreset } from "@tower/db";
import type { StepResult } from "./write";

const KEYWORDS = new Set(["every_minute", "hourly", "daily", "weekly", "monthly", "yearly"]);
const CRON_FIELD = /^[0-9*,/-]+$/;

function validFrequency(v: string): boolean {
  if (KEYWORDS.has(v)) return true;
  const fields = v.split(/\s+/);
  return v.length <= 64 && fields.length === 5 && fields.every((f) => CRON_FIELD.test(f));
}

function retention(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 365 ? n : null;
}

/** Preset'ten Coolify girdisi; hedef S3 yoksa veya kullanılamıyorsa needs_s3. */
export function presetTarget(preset: BackupPreset, storages: S3Storage[]): StepResult<BackupScheduleInput> {
  const target = storages.find((s) => s.uuid === preset.s3StorageUuid);
  if (!preset.s3StorageUuid || !target?.usable) {
    return { ok: false, error: { kind: "needs_s3", message: "Preset'te kullanılabilir bir S3 hedefi seçili değil." } };
  }
  return {
    ok: true,
    value: {
      frequency: preset.frequency,
      s3StorageUuid: preset.s3StorageUuid,
      keepLocal: preset.keepLocal,
      keepS3: preset.keepS3,
    },
  };
}

export type PresetForm = { frequency: string; keepLocal: number; keepS3: number; s3StorageUuid: string };

export function parsePresetForm(
  form: FormData,
  usableUuids: string[],
): { ok: true; value: PresetForm } | { ok: false; message: string } {
  const frequency = String(form.get("frequency") ?? "").trim();
  if (!validFrequency(frequency)) {
    return { ok: false, message: "Sıklık 5 alanlı cron (ör. 0 3 * * *) ya da daily/hourly/... olmalı." };
  }
  const keepLocal = retention(form.get("keepLocal"));
  const keepS3 = retention(form.get("keepS3"));
  if (keepLocal === null || keepS3 === null) {
    return { ok: false, message: "Saklama sayıları 1 ile 365 arasında tam sayı olmalı." };
  }
  const s3StorageUuid = String(form.get("s3StorageUuid") ?? "");
  if (!usableUuids.includes(s3StorageUuid)) {
    return { ok: false, message: "Kullanılabilir bir S3 hedefi seçin." };
  }
  return { ok: true, value: { frequency, keepLocal, keepS3, s3StorageUuid } };
}
```

`backups.ts`:

```ts
import "server-only";
import type { DatabaseBackup, Result } from "@tower/coolify";
import type { BackupScheduleInput } from "@tower/coolify/write";
import { performWrite, type WriteDeps, type WriteError, type WriteOutcome } from "./write";

export type BackupPorts = {
  getBackups(dbUuid: string): Promise<Result<DatabaseBackup[]>>;
  create(dbUuid: string, input: BackupScheduleInput): Promise<Result<{ uuid: string }>>;
};

export type RowStatus = "ok" | "failed" | "skipped";
export type BackupRow = { uuid: string; name: string; status: RowStatus; error?: WriteError };

export function hasActiveSchedule(backups: DatabaseBackup[]): boolean {
  return backups.some((b) => b.enabled);
}

/**
 * Tek veritabanına preset'le yedek programı kurar. Önce CANLI okur: etkin
 * program varsa yazmadan `skipped` döner (idempotent; toplu işlemin tekrarı güvenli).
 */
export async function enableBackup(
  deps: WriteDeps,
  ports: BackupPorts,
  actorEmail: string,
  db: { uuid: string; name: string },
  input: BackupScheduleInput,
  parentId?: string,
): Promise<BackupRow> {
  const existing = await ports.getBackups(db.uuid);
  if (!existing.ok) return { ...db, status: "failed", error: existing.error };
  if (hasActiveSchedule(existing.value)) return { ...db, status: "skipped" };

  const r = await performWrite(
    deps,
    { actorEmail, action: "backup.create", target: db.uuid, payload: input, parentId: parentId ?? null },
    () => ports.create(db.uuid, input),
  );
  return r.ok ? { ...db, status: "ok" } : { ...db, status: "failed", error: r.error };
}

/** Veritabanlarını SIRAYLA korur; ebeveyn satır yalnızca hepsi ok/skipped ise ok. */
export async function protectAll(
  deps: WriteDeps,
  ports: BackupPorts,
  actorEmail: string,
  dbs: { uuid: string; name: string }[],
  input: BackupScheduleInput,
): Promise<{ outcome: WriteOutcome<BackupRow[]>; rows: BackupRow[] }> {
  const rows: BackupRow[] = [];
  const outcome = await performWrite(
    deps,
    {
      actorEmail,
      action: "backup.protect_all",
      target: null,
      payload: { ...input, databases: dbs.map((d) => d.uuid) },
    },
    async (parentId) => {
      for (const db of dbs) {
        rows.push(await enableBackup(deps, ports, actorEmail, db, input, parentId));
      }
      const failed = rows.filter((r) => r.status === "failed").length;
      return failed === 0
        ? { ok: true as const, value: rows }
        : { ok: false as const, error: { kind: "partial" as const, message: `${failed}/${rows.length} veritabanı korunamadı.` } };
    },
  );
  return { outcome, rows };
}
```

- [ ] **Step 4: Çalıştır, PASS gör**

Run: `pnpm --filter @tower/web test && pnpm --filter @tower/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server
git commit -m "feat(web): enableBackup / protectAll with idempotent skip, preset parsing"
```

---

### Task 7: Server action'lar ve `/yedekleme` UI (tekli aç, toplu koru, preset)

**Files:**
- Create: `apps/web/src/app/yedekleme/actions.ts`, `apps/web/src/app/yedekleme/koru/page.tsx`, `apps/web/src/app/yedekleme/preset/page.tsx`, `apps/web/src/components/yedek-ac-butonu.tsx`, `apps/web/src/components/koru-formu.tsx`, `apps/web/src/components/preset-formu.tsx`, `apps/web/src/server/backup-ports.ts`
- Modify: `apps/web/src/app/yedekleme/page.tsx`

**Interfaces:**
- Consumes: Task 2 (`isWriter`), Task 5 (`getStore`, `loadDashboard.invalidate`), Task 6 (`enableBackup`, `protectAll`, `presetTarget`, `parsePresetForm`, `hasActiveSchedule`, `BackupRow`).
- Produces (server actions, `@/app/yedekleme/actions`):
  ```ts
  export type ActionState = { ok: boolean; message: string; rows?: BackupRow[] } | null;
  export async function enableBackupAction(prev: ActionState, form: FormData): Promise<ActionState>;   // form: uuid, name
  export async function protectAllAction(prev: ActionState, form: FormData): Promise<ActionState>;
  export async function savePresetAction(prev: ActionState, form: FormData): Promise<ActionState>;
  ```

- [ ] **Step 1: Coolify port'larını gerçek istemcilere bağla** — `server/backup-ports.ts`:

```ts
import "server-only";
import { getDatabaseBackups, listDatabases, listS3Storages, readConfig, type Result, type S3Storage } from "@tower/coolify";
import { createBackupSchedule, createWriteClient } from "@tower/coolify/write";
import type { BackupPorts } from "./backups";
import { hasActiveSchedule } from "./backups";
import { getCoolify } from "./coolify";

/** Gerçek Coolify port'ları. Yazma istemcisi yalnızca burada kurulur. */
export function backupPorts(): Result<BackupPorts> {
  const config = readConfig(process.env);
  if (!config.ok) return config;
  const read = getCoolify();
  if (!read.ok) return read;
  const write = createWriteClient(config.value);
  return {
    ok: true,
    value: {
      getBackups: (uuid) => getDatabaseBackups(read.value, uuid),
      create: (uuid, input) => createBackupSchedule(write, uuid, input),
    },
  };
}

/** Onay ekranı için CANLI (önbelleksiz) korumasız veritabanı listesi. */
export async function listUnprotected(): Promise<Result<{ uuid: string; name: string }[]>> {
  const http = getCoolify();
  if (!http.ok) return http;
  const dbs = await listDatabases(http.value);
  if (!dbs.ok) return dbs;
  const out: { uuid: string; name: string }[] = [];
  for (const db of dbs.value) {
    const b = await getDatabaseBackups(http.value, db.uuid);
    if (!b.ok || !hasActiveSchedule(b.value)) out.push({ uuid: db.uuid, name: db.name });
  }
  return { ok: true, value: out };
}

export async function liveStorages(): Promise<Result<S3Storage[]>> {
  const http = getCoolify();
  if (!http.ok) return http;
  return listS3Storages(http.value);
}
```

Not: `listUnprotected` backups'ı okunamayan veritabanını da listeye alır; `enableBackup` onu işlerken yeniden okur ve okuyamazsa `failed` döner — hiçbir zaman körlemesine yazılmaz.

- [ ] **Step 2: Server action'lar** — `app/yedekleme/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { enableBackup, protectAll, type BackupRow } from "@/server/backups";
import { backupPorts, listUnprotected, liveStorages } from "@/server/backup-ports";
import { loadDashboard } from "@/server/dashboard";
import { parsePresetForm, presetTarget } from "@/server/preset";
import { requireSession } from "@/server/session";
import { getStore } from "@/server/store";
import { performWrite, type WriteDeps } from "@/server/write";

export type ActionState = { ok: boolean; message: string; rows?: BackupRow[] } | null;

function deps(): WriteDeps {
  return { store: getStore(), writers: process.env.TOWER_WRITER_EMAILS };
}

function done() {
  loadDashboard.invalidate();
  revalidatePath("/yedekleme");
  revalidatePath("/denetim");
}

/** Preset + canlı S3 listesinden Coolify girdisi; store yoksa db hatası. */
async function resolveInput() {
  const store = getStore();
  if (!store) return { ok: false as const, message: "DATABASE_URL tanımlı değil; yazma kapalı." };
  const [preset, storages] = await Promise.all([store.getBackupPreset(), liveStorages()]);
  if (!storages.ok) return { ok: false as const, message: storages.error.message };
  const target = presetTarget(preset, storages.value);
  return target.ok ? { ok: true as const, value: target.value } : { ok: false as const, message: target.error.message };
}

export async function enableBackupAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireSession();
  const uuid = String(form.get("uuid") ?? "");
  const name = String(form.get("name") ?? "");
  const ports = backupPorts();
  if (!ports.ok) return { ok: false, message: ports.error.message };
  const input = await resolveInput();
  if (!input.ok) return { ok: false, message: input.message };

  const row = await enableBackup(deps(), ports.value, session.email, { uuid, name }, input.value);
  done();
  if (row.status === "skipped") return { ok: true, message: "Zaten etkin bir yedek programı var." };
  return row.status === "ok"
    ? { ok: true, message: "Yedek programı kuruldu." }
    : { ok: false, message: row.error?.message ?? "Uygulanmadı, tekrar deneyin." };
}

export async function protectAllAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  const session = await requireSession();
  const ports = backupPorts();
  if (!ports.ok) return { ok: false, message: ports.error.message };
  const input = await resolveInput();
  if (!input.ok) return { ok: false, message: input.message };
  const list = await listUnprotected();
  if (!list.ok) return { ok: false, message: list.error.message };

  const { outcome, rows } = await protectAll(deps(), ports.value, session.email, list.value, input.value);
  done();
  return outcome.ok
    ? { ok: true, message: `${rows.length} veritabanı işlendi.`, rows }
    : { ok: false, message: outcome.error.message, rows };
}

export async function savePresetAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireSession();
  const storages = await liveStorages();
  if (!storages.ok) return { ok: false, message: storages.error.message };
  const parsed = parsePresetForm(form, storages.value.filter((s) => s.usable).map((s) => s.uuid));
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const store = getStore();
  const r = await performWrite(
    deps(),
    { actorEmail: session.email, action: "preset.update", target: null, payload: parsed.value },
    async () => {
      await store!.upsertBackupPreset({ ...parsed.value, updatedBy: session.email });
      return { ok: true as const, value: parsed.value };
    },
  );
  done();
  return r.ok ? { ok: true, message: "Preset kaydedildi." } : { ok: false, message: r.error.message };
}
```

(`store!`: `performWrite` store null ise `fn`'i çağırmaz; bu yüzden `fn` içinde store tanımlıdır.)

- [ ] **Step 3: İstemci bileşenleri**

`components/yedek-ac-butonu.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { enableBackupAction, type ActionState } from "@/app/yedekleme/actions";

/** İki adımlı: önce preset özeti + Onayla, sonra server action. */
export function YedekAcButonu({ uuid, name, ozet }: { uuid: string; name: string; ozet: string }) {
  const [acik, setAcik] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(enableBackupAction, null);

  if (state) {
    return <span className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>;
  }
  if (!acik) {
    return (
      <button type="button" onClick={() => setAcik(true)} className="rounded border px-2 py-0.5 text-xs">
        Yedeklemeyi aç
      </button>
    );
  }
  return (
    <form action={action} className="flex items-center gap-2 text-xs">
      <input type="hidden" name="uuid" value={uuid} />
      <input type="hidden" name="name" value={name} />
      <span className="text-neutral-600">{ozet}</span>
      <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-2 py-0.5 text-white">
        {pending ? "Kuruluyor…" : "Onayla"}
      </button>
      <button type="button" onClick={() => setAcik(false)} className="underline">
        İptal
      </button>
    </form>
  );
}
```

`components/koru-formu.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { protectAllAction, type ActionState } from "@/app/yedekleme/actions";

const ETIKET = { ok: "kuruldu", skipped: "zaten var", failed: "başarısız" } as const;

export function KoruFormu({ adet }: { adet: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(protectAllAction, null);

  return (
    <div className="space-y-4">
      {!state && (
        <form action={action}>
          <button type="submit" disabled={pending || adet === 0} className="rounded bg-neutral-900 px-3 py-1 text-sm text-white">
            {pending ? "Sırayla işleniyor…" : `${adet} veritabanını koru`}
          </button>
        </form>
      )}
      {state && (
        <>
          <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>
          <ul className="text-sm">
            {(state.rows ?? []).map((r) => (
              <li key={r.uuid} className="flex gap-3 border-t border-neutral-100 py-1">
                <span className="flex-1">{r.name}</span>
                <span>{ETIKET[r.status]}</span>
                {r.error && <span className="text-xs text-red-700">{r.error.kind}</span>}
              </li>
            ))}
          </ul>
          {!state.ok && (
            <p className="text-xs text-neutral-600">
              Tekrar denemeden önce /yedekleme&apos;yi kontrol edin; tekrar çalıştırmak kurulu olanları atlar.
            </p>
          )}
        </>
      )}
    </div>
  );
}
```

`components/preset-formu.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { savePresetAction, type ActionState } from "@/app/yedekleme/actions";

type Props = {
  preset: { frequency: string; keepLocal: number; keepS3: number; s3StorageUuid: string | null };
  storages: { uuid: string; name: string; bucket: string }[];
};

export function PresetFormu({ preset, storages }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(savePresetAction, null);
  return (
    <form action={action} className="max-w-md space-y-3 text-sm">
      <label className="block">
        Sıklık (cron)
        <input name="frequency" defaultValue={preset.frequency} className="mt-1 block w-full rounded border px-2 py-1" />
        <span className="text-xs text-neutral-500">Cron, Coolify sunucusunun saat diliminde çalışır.</span>
      </label>
      <label className="block">
        Yerelde saklanacak yedek sayısı
        <input name="keepLocal" type="number" min={1} max={365} defaultValue={preset.keepLocal} className="mt-1 block w-full rounded border px-2 py-1" />
      </label>
      <label className="block">
        S3&apos;te saklanacak yedek sayısı
        <input name="keepS3" type="number" min={1} max={365} defaultValue={preset.keepS3} className="mt-1 block w-full rounded border px-2 py-1" />
      </label>
      <label className="block">
        Hedef S3
        <select name="s3StorageUuid" defaultValue={preset.s3StorageUuid ?? ""} className="mt-1 block w-full rounded border px-2 py-1">
          <option value="" disabled>
            Seçin
          </option>
          {storages.map((s) => (
            <option key={s.uuid} value={s.uuid}>
              {s.name} ({s.bucket})
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-1 text-white">
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </button>
      {state && <p className={state.ok ? "text-emerald-700" : "text-red-700"}>{state.message}</p>}
      <p className="text-xs text-neutral-500">Preset yalnızca yeni kurulan programlara uygulanır.</p>
    </form>
  );
}
```

- [ ] **Step 4: Sayfalar**

`app/yedekleme/preset/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Kart } from "@/components/kart";
import { PresetFormu } from "@/components/preset-formu";
import { liveStorages } from "@/server/backup-ports";
import { requireSession } from "@/server/session";
import { getStore } from "@/server/store";
import { isWriter } from "@/server/writers";

export default async function PresetSayfasi() {
  const session = await requireSession();
  if (!isWriter(session.email, process.env.TOWER_WRITER_EMAILS)) redirect("/yedekleme");
  const store = getStore();
  if (!store) {
    return (
      <main className="p-8">
        <Kart baslik="Yedek preset'i" tazelik="ulasilamiyor">
          <p className="text-sm">DATABASE_URL tanımlı değil; yazma kapalı.</p>
        </Kart>
      </main>
    );
  }
  const [preset, storages] = await Promise.all([store.getBackupPreset(), liveStorages()]);
  const usable = storages.ok ? storages.value.filter((s) => s.usable) : [];
  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Yedek preset&apos;i</h1>
      <PresetFormu
        preset={preset}
        storages={usable.map(({ uuid, name, bucket }) => ({ uuid, name, bucket }))}
      />
    </main>
  );
}
```

`app/yedekleme/koru/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { KoruFormu } from "@/components/koru-formu";
import { listUnprotected, liveStorages } from "@/server/backup-ports";
import { presetTarget } from "@/server/preset";
import { requireSession } from "@/server/session";
import { getStore } from "@/server/store";
import { isWriter } from "@/server/writers";

export const dynamic = "force-dynamic";

export default async function KoruSayfasi() {
  const session = await requireSession();
  if (!isWriter(session.email, process.env.TOWER_WRITER_EMAILS)) redirect("/yedekleme");
  const store = getStore();
  if (!store) return <main className="p-8 text-sm">DATABASE_URL tanımlı değil; yazma kapalı.</main>;

  const [preset, storages, list] = await Promise.all([store.getBackupPreset(), liveStorages(), listUnprotected()]);
  const target = presetTarget(preset, storages.ok ? storages.value : []);
  if (!target.ok) redirect("/yedekleme/preset");
  if (!list.ok) return <main className="p-8 text-sm text-red-700">{list.error.message}</main>;

  const hedef = storages.ok ? storages.value.find((s) => s.uuid === target.value.s3StorageUuid)?.name : "";
  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Korumasız veritabanlarını koru</h1>
      <p className="text-sm text-neutral-700">
        Her birine şu program kurulacak: <code>{target.value.frequency}</code>, yerelde {target.value.keepLocal},
        S3&apos;te {target.value.keepS3} yedek → <strong>{hedef}</strong>.
      </p>
      <ul className="text-sm">
        {list.value.map((d) => (
          <li key={d.uuid} className="border-t border-neutral-100 py-1">
            {d.name}
          </li>
        ))}
      </ul>
      <KoruFormu adet={list.value.length} />
    </main>
  );
}
```

`app/yedekleme/page.tsx` değişiklikleri:
1. `await requireSession();` → `const session = await requireSession();`
2. Importlar: `import Link from "next/link";`, `import { YedekAcButonu } from "@/components/yedek-ac-butonu";`, `import { getStore } from "@/server/store";`, `import { isWriter } from "@/server/writers";`
3. `loadDashboard()` sonrasında:

```tsx
const yazici = isWriter(session.email, process.env.TOWER_WRITER_EMAILS);
const preset = yazici ? await getStore()?.getBackupPreset() : undefined;
const ozet = preset ? `${preset.frequency} · ${preset.keepLocal} yerel / ${preset.keepS3} S3` : "";
```

4. `<h1>` satırından hemen sonra:

```tsx
{yazici && (
  <div className="flex gap-4 text-sm">
    <Link href="/yedekleme/koru" className="underline">Korumasız veritabanlarını koru</Link>
    <Link href="/yedekleme/preset" className="underline">Preset&apos;i düzenle</Link>
    <Link href="/denetim" className="underline">Denetim kaydı</Link>
  </div>
)}
```

5. `aktif.length === 0` dalındaki "yedek yok" rozetinin hemen arkasına (aynı fragment içinde):

```tsx
<>
  <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-900 ring-1 ring-red-300">
    yedek yok
  </span>
  {yazici && preset && <YedekAcButonu uuid={db.uuid} name={db.name} ozet={ozet} />}
</>
```

- [ ] **Step 5: Doğrula**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: PASS; bundle-safety testi istemci bileşenlerinin `@/server/*` / `@tower/*` import etmediğini doğrular (yalnızca `@/app/yedekleme/actions` import ederler).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): enable/protect-all backup actions, preset editor on /yedekleme"
```

---

### Task 8: `/denetim` sayfası

**Files:**
- Create: `apps/web/src/server/audit-view.ts`, `apps/web/src/server/audit-view.test.ts`, `apps/web/src/app/denetim/page.tsx`

**Interfaces:**
- Consumes: `AuditRow` (`@tower/db`), `getStore` (Task 5).
- Produces: `auditDisplayStatus(row: Pick<AuditRow, "status" | "createdAt">, now: number): "ok" | "failed" | "pending" | "interrupted"`.

- [ ] **Step 1: Failing test** — `audit-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { auditDisplayStatus } from "./audit-view";

const t0 = Date.UTC(2026, 8, 22, 12, 0, 0);

describe("auditDisplayStatus", () => {
  it("5 dakikadan eski pending 'interrupted' olur", () => {
    expect(auditDisplayStatus({ status: "pending", createdAt: new Date(t0) }, t0 + 5 * 60_000 + 1)).toBe("interrupted");
  });
  it("taze pending pending kalır", () => {
    expect(auditDisplayStatus({ status: "pending", createdAt: new Date(t0) }, t0 + 60_000)).toBe("pending");
  });
  it("ok/failed olduğu gibi döner", () => {
    expect(auditDisplayStatus({ status: "ok", createdAt: new Date(t0) }, t0 + 10 * 60_000)).toBe("ok");
    expect(auditDisplayStatus({ status: "failed", createdAt: new Date(t0) }, t0)).toBe("failed");
  });
});
```

- [ ] **Step 2: Çalıştır, FAIL gör**

Run: `pnpm --filter @tower/web test -- audit-view`
Expected: FAIL — modül yok.

- [ ] **Step 3: Uygula** — `audit-view.ts`:

```ts
import type { AuditRow } from "@tower/db";

const INTERRUPTED_MS = 5 * 60_000;

/** 5 dakikadan eski `pending` satır "yarıda kaldı" sayılır (arka plan işi yok). */
export function auditDisplayStatus(
  row: Pick<AuditRow, "status" | "createdAt">,
  now: number,
): "ok" | "failed" | "pending" | "interrupted" {
  if (row.status === "pending" && now - row.createdAt.getTime() > INTERRUPTED_MS) return "interrupted";
  return row.status;
}
```

`app/denetim/page.tsx`:

```tsx
import { Kart } from "@/components/kart";
import { auditDisplayStatus } from "@/server/audit-view";
import { requireSession } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const ETIKET = { ok: "tamam", failed: "başarısız", pending: "sürüyor", interrupted: "yarıda kaldı" } as const;
const RENK = { ok: "text-emerald-700", failed: "text-red-700", pending: "text-neutral-600", interrupted: "text-amber-700" } as const;

export default async function Denetim() {
  await requireSession();
  const store = getStore();
  if (!store) {
    return (
      <main className="p-8">
        <Kart baslik="Denetim kaydı" tazelik="ulasilamiyor">
          <p className="text-sm">DATABASE_URL tanımlı değil.</p>
        </Kart>
      </main>
    );
  }
  const rows = await store.listAudit(200);
  const now = Date.now();
  return (
    <main className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Denetim kaydı</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Henüz yazma işlemi yok.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-neutral-500">
            <tr>
              <th className="py-1">Zaman</th>
              <th>Kim</th>
              <th>İşlem</th>
              <th>Hedef</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = auditDisplayStatus(r, now);
              return (
                <tr key={r.id} className={`border-t border-neutral-100 ${r.parentId ? "text-neutral-600" : ""}`}>
                  <td className="py-1">{r.createdAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</td>
                  <td>{r.actorEmail}</td>
                  <td>{r.parentId ? `↳ ${r.action}` : r.action}</td>
                  <td className="font-mono text-xs">{r.target ?? "—"}</td>
                  <td className={RENK[d]}>
                    {ETIKET[d]}
                    {r.errorKind ? ` (${r.errorKind})` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Çalıştır, PASS gör**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): /denetim audit log page with interrupted pending rows"
```

---

### Task 9: Belgeler, `.env.example`, canlı doğrulama

**Files:**
- Create: `.env.example`
- Modify: `CLAUDE.md` (Verify, Environments, Gotchas), `packages/coolify/src/fixtures/` (yalnızca canlı adımda)

**Interfaces:** Consumes: tümü. Produces: yok.

- [ ] **Step 1: `.env.example`** (repo kökü; gerçek değer YOK):

```dotenv
# Coolify (salt okuma + Faz 2A yedek yazma)
COOLIFY_URL=https://panel.example.app
COOLIFY_TOKEN=

# NexAuth OIDC — giriş yetkisi NexAuth'taki uygulama grant'idir
NEXAUTH_ISSUER=
TOWER_OIDC_CLIENT_ID=
TOWER_OIDC_CLIENT_SECRET=
TOWER_BASE_URL=http://localhost:3000
# en az 32 bayt
TOWER_SESSION_SECRET=

# Yazma yetkisi: virgülle ayrılmış e-postalar. Boş = kimse yazamaz.
TOWER_WRITER_EMAILS=

# Tower Postgres (denetim kaydı + yedek preset'i). Boş = yazma kapalı.
DATABASE_URL=

# Plane / Purelymail (henüz uygulamaya bağlı değil)
PLANE_URL=
PLANE_ACCESS_TOKEN=
PURELYMAIL_TOKEN=
```

- [ ] **Step 2: `CLAUDE.md`** — şu değişiklikler:
  - Layout'a ekle: `` - `packages/coolify` — Coolify istemcisi; kök giriş salt okuma, `@tower/coolify/write` yazma. `` ve `` - `packages/db` — `@tower/db`: Drizzle + postgres-js; denetim kaydı ve yedek preset'i. ``
  - Verify'a ekle: `` pnpm --filter @tower/db test:db   # Docker gerekir; Postgres entegrasyon testleri ``
  - Environments: `TOWER_ALLOWED_EMAILS` geçen metni kaldır; `DATABASE_URL`, `TOWER_WRITER_EMAILS` ekle; "`.env.example` tüm değişkenleri listeler."
  - Gotchas'a ekle:
    - `` `COOLIFY_TOKEN` `|` içerir: `.env.local`'ı shell ile `source` etmeyin (değer boş okunur, 401 alırsınız). `--env-file` / `process.loadEnvFile` kullanın. ``
    - `` `GET /s3-storages` `key` ve `secret`'ı düz metin döner. Fixture kaydı her zaman `redactJson`'dan geçer; `listS3Storages` yalnızca güvenli alanları kopyalar — bu alan listesini genişletmeyin. ``
    - `` Coolify yazmaları yalnızca `apps/web/src/server/write.ts` içindeki `performWrite` üzerinden yapılır; `@tower/coolify/write`'ı başka yerden import etmeyin. ``

- [ ] **Step 3: Tam doğrulama**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm --filter @tower/db test:db`
Expected: hepsi exit 0.

- [ ] **Step 4: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "docs: env example and phase 2A gotchas"
```

- [ ] **Step 5: Canlı doğrulama (İNSAN — üretime yazar, onay gerekir)**

Önkoşullar (kullanıcı yapar): Coolify'da Tower Postgres'i oluştur → `DATABASE_URL` `.env.local`'a; `TOWER_WRITER_EMAILS` kendi e-postan; NexAuth OIDC env'leri tanımlı.

1. `pnpm --filter @tower/db db:migrate` → `migration tamam`.
2. `pnpm dev`, giriş yap, `/yedekleme/preset` → hedef `nexstep-tower`, Kaydet.
3. `/yedekleme`'de KRİTİK OLMAYAN bir veritabanında (ilk aday: Tower'ın kendi Postgres'i) "Yedeklemeyi aç" → Onayla.
4. Coolify UI'da o veritabanının Backups sekmesinde `0 3 * * *`, S3 = `nexstep-tower` programını gör.
5. `/denetim`'de eşleşen `backup.create` satırı `tamam`.
6. `POST` cevabını fixture olarak kaydet (redact'lı): `packages/coolify/src/fixtures/backup-create.json` içine `{ "uuid": "<gerçek uuid>", "message": "Backup configuration created successfully." }` ve `write.test.ts`'e bu fixture'ı `createBackupSchedule` cevabı olarak kullanan bir test ekle. Commit: `test(coolify): live backup-create fixture (4.3.23)`.
7. Ancak bundan sonra `/yedekleme/koru` ile kalan veritabanlarını koru.

Uç 4.3.23'te farklı davranırsa (ör. 422 alan hatası): DUR, hata mesajını kaydet, planı yeniden yap.
