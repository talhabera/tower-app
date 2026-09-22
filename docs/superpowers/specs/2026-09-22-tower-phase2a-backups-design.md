# Tower — Faz 2A: Yedekleme Yazma Yolu (Tasarım)

Tarih: 2026-09-22
Durum: onaylandı (tasarım), uygulama planı bekliyor
Önceki: `2026-09-19-tower-coolify-control-room-design.md` (Faz 1, salt okuma)

## Amaç

Faz 1 sessiz riskleri görünür yaptı; en büyüğü 7/7 veritabanında yedek programı
olmaması ve S3 hedefinin tanımsız olması. Faz 2A, Tower'a **ilk yazma yolunu**
ekler ve bu boşluğu kapatır: S3 storage tanımlamak ve veritabanlarına yedek programı
kurmak. Her yazma denetim kaydına (audit log) düşer.

Faz 2 iki bağımsız alt sisteme bölündü:
- **2A (bu belge):** yazma altyapısı + yedekleme.
- **2A.2:** restart / deploy / stop / env değişikliği — 2A'nın altyapısını kullanır.
- **2B:** template çıkarma + stepped setup wizard — 2A'ya bağımlı.

## Kapsam

1. Faz 1.1'den iki auth düzeltmesi (yazma gelmeden önce auth sağlam olmalı).
2. Yazıcı yetkisi: `TOWER_WRITER_EMAILS`.
3. Tower'ın kendi Postgres'i ve denetim kaydı.
4. S3 storage oluşturma + doğrulama.
5. Veritabanı başına "Yedeklemeyi aç" ve toplu "Korumasız N veritabanını koru".
6. `/denetim` sayfası.

## Kapsam dışı (Faz 2A)

- Restart, deploy, stop, env değişikliği → 2A.2
- S3 storage düzenleme/silme, yedek programı silme
- Yedekten geri yükleme (restore)
- Uyarı/bildirim → Faz 4
- Tower'ın kendisinin Coolify'a deploy edilmesi
- Faz 1.1'in auth dışı maddeleri (son deploy zamanı, sunucu kök ağaç, son yedek
  sonucu, getHealth/getVersion, `revalidate` no-op). Ayrı ele alınır.

## Kararlar

| Karar | Seçim | Gerekçe |
|---|---|---|
| Kapsam kesiti | Yedek önce | En büyük canlı risk; restart/deploy zaten Coolify UI'da var |
| Denetim deposu | Postgres (Coolify üzerinde) | 2B de kalıcı depo ister; sorgulanabilir |
| Yazma yetkisi | `TOWER_WRITER_EMAILS` allowlist | Boşsa kimse yazamaz (fail closed) |
| Giriş yetkisi | NexAuth uygulama/özellik grant'i | `TOWER_ALLOWED_EMAILS` kaldırılır |
| Yedek UX | Preset + toplu işlem, onay ekranı | 7 formu tek adıma indirir |
| Mimari | Subpath export + `@tower/db` + tek `performWrite` | En az hareketli parça; denetim garantisi tek fonksiyonda |

## Mimari

```
apps/web
  ├── lib/write.ts        performWrite(): yetki → audit pending → Coolify → audit ok/failed
  ├── server actions      her UI işlemi için ince action, hepsi performWrite'tan geçer
  └── /yedekleme, /denetim
packages/
  ├── coolify/            mevcut; kök giriş yalnızca okuma
  │     └── write (subpath export "@tower/coolify/write")
  └── db/                 yeni: @tower/db (Drizzle + postgres-js)
```

### `@tower/coolify/write`

- `package.json` `exports` içinde ayrı giriş: `"./write"`. Kök giriş (`@tower/coolify`)
  yazma metodlarını **yeniden dışa aktarmaz**. Yalnızca kök girişi import eden kod
  yazma metoduna erişemez.
- HTTP istemcisine `post` ve `patch` eklenir; bunlar yalnızca `write` girişinden
  kullanılabilir (`createWriteClient`). Kök girişteki `CoolifyHttp` tipi `get`-only kalır.
- Metodlar: `createS3Storage`, `validateS3Storage`, `createBackupSchedule`,
  `updateBackupSchedule`. Hepsi `Result<T, CoolifyError>` döner, throw etmez.
- Hata mesajları ve payload'lar mevcut `maskSecrets` / `redactJson` ile maskelenir.
- Zaman aşımı 20 sn, yeniden deneme yok.

### `@tower/db`

- Drizzle şeması, `drizzle-kit` ile üretilen ve commit'lenen migration'lar.
- Env: `DATABASE_URL`. Yoksa yazma yolları `db` hatası döner; okuma sayfaları
  etkilenmez (Faz 1 davranışı korunur).
- Dışa açılan yüzey: `createDb(url)`, `appendAudit`, `finishAudit`, `listAudit`,
  `getBackupPreset`, `upsertBackupPreset`.

### `performWrite(actor, action, fn)`

Tüm yazmaların tek geçidi. Sırası sabittir:

1. Oturumdaki e-posta `TOWER_WRITER_EMAILS` içinde değilse → `forbidden`. Denetim satırı
   yazılmaz (hiçbir şey denenmedi).
2. `appendAudit(status='pending')`. Başarısızsa → `db` hatası, Coolify **çağrılmaz**.
3. `fn()` → `Result`.
4. `finishAudit(ok | failed, error_kind, masked result)`.

## Veri modeli

```
audit_log
  id           uuid pk
  actor_email  text not null
  action       text not null      -- 's3.create' | 's3.validate' | 'backup.create'
                                  -- | 'backup.update' | 'backup.protect_all'
  target       text               -- coolify uuid (veritabanı / s3 storage)
  payload      jsonb not null     -- sırlar maskelenmiş istek
  status       text not null      -- 'pending' | 'ok' | 'failed'
  error_kind   text               -- CoolifyErrorKind | 'forbidden' | 'db'
  result       jsonb              -- maskelenmiş cevap (ör. oluşan uuid)
  parent_id    uuid               -- toplu işlemin çocuk satırları ebeveyni gösterir
  created_at   timestamptz not null default now()
  finished_at  timestamptz

backup_preset   -- tek satır
  id               int pk (sabit 1)
  frequency        text not null default '0 3 * * *'
  timezone         text not null default 'Europe/Istanbul'
  keep_local       int  not null default 7
  keep_s3          int  not null default 30
  s3_storage_uuid  text           -- null ise yedek açılamaz (needs_s3)
  updated_by       text
  updated_at       timestamptz
```

S3 secret key Tower veritabanında **hiçbir yerde** saklanmaz; doğrudan Coolify'a gider,
denetim payload'ında maskelenir.

## Akışlar

### Yedeklemeyi aç (tek veritabanı)

1. Yazıcı kontrolü (UI'da buton yazıcı değilse gizli; server action yine kontrol eder).
2. Preset'i oku. `s3_storage_uuid` yoksa → `needs_s3`, UI S3 formuna yönlendirir.
3. `performWrite('backup.create', dbUuid, () => createBackupSchedule(dbUuid, preset))`.
4. `revalidatePath('/yedekleme')`.

### Korumasız N veritabanını koru (toplu)

1. Onay ekranı: korumasız veritabanlarını **canlı** okur (önbellek yok), listeyi ve
   uygulanacak preset'i gösterir.
2. Onayda: bir ebeveyn denetim satırı (`backup.protect_all`).
3. Veritabanları **sırayla** işlenir; her biri ebeveyne bağlı çocuk satır alır.
   İşlem anında zaten programı olan veritabanı `skipped` sayılır (idempotent).
4. Sonuç: veritabanı başına tablo (ok / failed + kind / skipped).
   Ebeveyn satır yalnızca tümü ok veya skipped ise `ok`, aksi halde `failed`.

### S3 storage oluştur

1. Form: endpoint, bucket, region, access key, secret key.
2. `s3.create` → ardından hemen `s3.validate` (iki ayrı denetim satırı).
3. Doğrulama başarısızsa storage Coolify'da kalır, UI "doğrulanmadı" gösterir ve
   preset hedefi olarak seçilemez.

## Hata yönetimi

| Durum | Davranış |
|---|---|
| `unreachable` / `rate_limited` | Satır `failed`; UI "uygulanmadı, tekrar dene". Otomatik retry yok |
| İstek gönderildikten sonra zaman aşımı | `failed`, `error_kind='unreachable'`; UI "tekrar denemeden önce /yedekleme'yi kontrol et". Toplu işlemde idempotent atlama tekrarı güvenli kılar |
| `unauthorized` | Satır `failed`; UI token'ın geçersiz olduğunu söyler |
| Denetim insert'i başarısız | `db` hatası, Coolify çağrılmaz |
| 5 dakikadan eski `pending` | `/denetim`'de "yarıda kaldı" gösterilir. Arka plan işi yok |

## Auth değişiklikleri (Faz 1.1'den)

- `proxy.ts`: kimliksiz istek yönlendirmesi `request.url` yerine `TOWER_BASE_URL`'den kurulur.
- `session.ts`: anahtar, sırrın kesilmesi yerine SHA-256 türetmesiyle elde edilir.
  Mevcut oturumlar geçersiz olur (tek kullanıcı, kabul edilebilir).
- `TOWER_ALLOWED_EMAILS` ve ilgili kod kaldırılır; giriş NexAuth grant'ine bırakılır.
- `TOWER_WRITER_EMAILS` eklenir: virgülle ayrılmış, büyük/küçük harf duyarsız,
  boş/tanımsız = yazıcı yok.

## Canlı API doğrulaması (uygulamanın ilk adımı)

Upstream Coolify OpenAPI (v4.x) gerekli uçları içeriyor: `POST /s3-storages`,
`POST /s3-storages/{uuid}/validate`, `POST|PATCH /databases/{uuid}/backups`,
`GET /databases/{uuid}/backups/{uuid}/executions`.

2026-09-22'de canlı instance token'ı reddetti (`401 Unauthenticated`); Faz 1'den bekleyen
token rotasyonu gerekli. Rotasyondan sonra:
1. Canlı sürümde bu uçların varlığı doğrulanır.
2. İstek/cevap fixture'ları kaydedilir (sırlar maskeli).
3. Uçlardan biri yoksa uygulama durur ve plan yeniden yapılır.

## Test

- `@tower/coolify/write`: stub fetch + kaydedilmiş fixture'larla vitest. Her hata türü ve
  sırların maskelenmesi.
- Bundle güvenliği: hiçbir client chunk `@tower/coolify/write` içermez (Faz 1'deki
  bundle-safety testinin genişletilmesi).
- `performWrite`: sahte db + sahte Coolify ile: yazıcı olmayan reddedilir, denetim hatası
  çağrıyı engeller, Coolify hatası kaydedilir, toplu işlem idempotenttir.
- `@tower/db`: geçici Postgres'e (Docker `postgres:17`) migration + `appendAudit`/`finishAudit`
  gidiş-dönüşü. Docker yoksa test görünür bir notla atlanır.
- Canlı Coolify'a yazan otomatik test **yoktur**. Canlı doğrulama elle yapılır.

## Kurulum (insan tarafından)

- Coolify'da Tower için yeni Postgres → `DATABASE_URL`. Toplu işlemle ilk korunan
  veritabanı bu olur.
- Root'ta `.env.example`: `DATABASE_URL`, `TOWER_WRITER_EMAILS` ve Faz 1 değişkenleri.
- Coolify token rotasyonu (Faz 1'den bekliyor).

## Bitti sayılır

- `pnpm typecheck && pnpm lint && pnpm build && pnpm test` geçer.
- Tower'dan oluşturulan bir yedek programı Coolify'da görünür ve `/denetim`'de eşleşen
  `ok` satırı vardır.
