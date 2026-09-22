# Tower — Faz 1: Coolify Kontrol Odası (Tasarım)

Tarih: 2026-09-19
Durum: onaylandı (kapsam), uygulama planı bekliyor

## Amaç

Tower, NexStep altyapısının merkezi kontrol odasıdır. Faz 1 tek bir şeyi yapar:
Coolify instance'ındaki (`panel.example.app`) her kaynağı tek ekranda okunabilir
kılmak ve **sessiz riskleri görünür hale getirmek**. Faz 1'de hiçbir yazma işlemi yoktur.

## Neden şimdi — canlı envanterden çıkan bulgular

2026-09-19 tarihli canlı okuma (5 sunucu, 10 proje, 28 kaynak):

| Bulgu | Ölçüm | Sonuç |
|---|---|---|
| Veritabanı yedeği yok | 7/7 veritabanında sıfır yedek programı | Veri kaybı riski, geri dönüşü yok |
| S3 storage tanımsız | 0 adet | Yedek açılsa bile hedefi yok |
| Healthcheck kapalı | 17 uygulamanın 12'si `running:unknown` | Çöken servis "çalışıyor" görünür |
| Düşmüş servis | 3 kaynak `exited:unhealthy` (relay-web, relay-worker) | Fark edilmemiş |

Kontrol odasının ilk işi bu dört satırı her gün ilk ekranda göstermektir.
Faz 1'in başarı kriteri güzel bir tablo değil, **bu boşlukların görünür olması**.

## Kapsam dışı (Faz 1)

- Her türlü yazma: deploy, restart, stop, env değişikliği, yedek programı oluşturma → Faz 2
- Template çıkarma ve stepped setup wizard → Faz 2
- Purelymail mail yönetimi → Faz 3
- Uyarı/bildirim gönderimi (Telegram, e-posta) → Faz 4
- Veritabanı. Faz 1 stateless çalışır.

## Mimari

```
apps/web (Next.js 16, App Router)
  └── Server Components / Server Actions  ← token yalnızca burada
        └── @tower/coolify   (tipli okuma istemcisi)
packages/
  └── coolify/   OpenAPI'den üretilen tipler + ince fetch katmanı
```

### `@tower/coolify`

- Tipler `coollabsio/coolify` OpenAPI şemasından üretilir (`pnpm gen:coolify`),
  elle yazılmaz. Üretilen dosya commit'lenir; build zamanı ağ çağrısı yoktur.
- Dışa açılan yüzey **yalnızca okuma**dır: `listServers`, `listProjects`,
  `getEnvironment`, `listResources`, `getApplication`, `listDeployments`,
  `listDatabases`, `getDatabaseBackups`, `listS3Storages`, `getHealth`, `getVersion`.
  Yazma metodları pakette **bulunmaz** — kazayla çağrılamaz, bu bir tip garantisidir.
- Her metod `Result<T, CoolifyError>` döner, throw etmez. `CoolifyError` ayrımı:
  `unreachable | unauthorized | rate_limited | not_found | malformed`.
- Zaman aşımı 20 sn. Yeniden deneme yok (Faz 1 okuma, kullanıcı yeniler).

### Filo ağacı nasıl kurulur

`/resources` proje ve environment adını **döndürmez** (canlı doğrulandı). Ağaç şöyle kurulur:

1. `GET /projects` → proje listesi
2. `GET /projects/{uuid}/environments` → her projenin environment'ları
3. `GET /projects/{uuid}/{environment}` → o environment'ın kaynakları
4. `GET /servers` → sunucu adları, `is_reachable` / `is_usable`

Bu N+1 çağrı demektir (10 proje ≈ 25 istek). Tek bir `loadFleet()` fonksiyonunda
toplanır, eşzamanlılık 6 ile sınırlanır, sonuç 10 sn `revalidate` ile önbelleklenir.
Kısmi başarısızlık ağacı çökertmez: ulaşılamayan dal "ulaşılamıyor" olarak işaretlenir.

## Ekranlar

### 1. Genel Durum (kök sayfa)

Üstte **dört risk sayacı**, yukarıdaki bulgu tablosundan birebir:
yedeksiz veritabanı sayısı · healthcheck'siz uygulama sayısı · düşmüş kaynak sayısı ·
ulaşılamayan sunucu sayısı. Her sayaç ilgili filtrelenmiş listeye tıklanır.
Sıfır olan sayaç sessizleşir, kaybolmaz.

### 2. Filo

Sunucu → proje → environment → kaynak ağacı. Her kaynak satırında: durum rozeti
(`running:healthy` / `running:unknown` / `exited:unhealthy` ayrı ayrı renklenir —
`unknown` sessiz sarıdır, yeşil değildir), tip, son deploy zamanı.

### 3. Kaynak Detayı

Durum, domain'ler (`fqdn` virgülle ayrılmış, ayrıştırılıp liste halinde),
build pack, git repo + branch, healthcheck ayarı, açık portlar, kaynak limitleri,
storage'lar, zamanlanmış görevler, son 10 deployment, log kuyruğu.
Env **anahtarları** listelenir, **değerler gösterilmez**.

### 4. Yedekleme & Depolama

Her veritabanı bir satır: yedek programı var mı, sıklık, S3'e yazıyor mu,
son çalıştırma sonucu. S3 storage listesi ve `is_usable` durumu.
Bugün bu ekran tamamen kırmızıdır; işi budur.

## Gizli bilgi kuralları

- `COOLIFY_TOKEN` ve `COOLIFY_URL` yalnızca sunucu tarafında okunur.
  `NEXT_PUBLIC_` önekli hiçbir değişkene taşınmaz.
- Env değerleri istemciye **hiç gönderilmez**. Server Component değerleri
  serialize etmeden önce düşürür — maskeleme istemcide değil, kaynakta yapılır.
- Log çıktıları render öncesinden geçer: 20+ karakterlik base64/hex benzeri
  diziler ve bilinen anahtar desenleri (`*_TOKEN=`, `*_SECRET=`, `postgres://`)
  maskelenir.
- Fixture'lar kaydedilmeden önce aynı maskeleme uygulanır; ham API cevabı repoya girmez.

## Hata durumu

Coolify erişilemezse sayfa çökmez. Her kart üç durumdan birindedir:
`taze` · `bayat (son başarılı okuma zamanı ile)` · `ulaşılamıyor`.
401 alınırsa tüm sayfa tek bir "token geçersiz" bandına düşer — kart kart tekrar denenmez.

## Auth

Tower, NexAuth'un (`auth.example.app`) OIDC client'ı olur. Giriş yapmamış istek
hiçbir Coolify çağrısı tetiklemez — kontrol proxy katmanında, sayfa içinde değil.
Faz 1'de rol ayrımı yoktur: giriş yapan görür.

Oturum, imzalı şifreli bir çerezde taşınır (JWT); oturum tablosu yoktur. "Faz 1'de
veritabanı yok" kuralı böyle korunur. Çerez `httpOnly`, `secure`, `sameSite=lax`.
Access token yenileme gerektiğinde refresh token aynı çerezde saklanır; Coolify
token'ı ile karıştırılmaz, ayrı alandır.

## Test

- `vitest`. `@tower/coolify` canlı instance'tan bir kez çekilip maskelenen
  fixture'lara karşı test edilir (fetch mock).
- Zorunlu kapsam: filo ağacının kısmi başarısızlıkta ayakta kalması,
  `Result` hata ayrımları, env değerlerinin serialize edilen çıktıda
  **bulunmadığını** doğrulayan test, log maskeleme.
- Yeşil tanımı: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Açık konu

Coolify token'ı 2026-09-19'da oturum kaydına düştü (`.env.local`'da `=` sonrası
boşluk, `source` değeri komut sandı). Token döndürülmeli. `.env.local` satırları
boşluksuz `KEY=value` biçimine getirilmeli.
