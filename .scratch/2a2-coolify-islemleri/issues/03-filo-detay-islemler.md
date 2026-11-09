# 03 /filo/[uuid]: restart, deploy, env form and live deployment status

Status: ready-for-agent
Blocked by: 02

worker: auto

GOAL:        On `/filo/<uuid>` a writer can restart or deploy the application with a two-click confirm, paste `KEY=VALUE` lines to create or update env vars (optionally restarting after), and watch the started deployment's status update live until it ends.
CONSTRAINTS: All writes go through the server functions from issue 02 (`restartApp`, `deployApp`, `setEnvs`, `appOpsPorts`); the app layer never imports `@tower/coolify/write`. Server actions call `requireSession()` first and check `isWriter` (same shape as `apps/web/src/app/yedekleme/actions.ts`). Non-writers see the controls disabled with the text "Yazma yetkiniz yok.". The env value never comes back to the browser: after submit the textarea is cleared and the response holds only key names. The existing read sections on the page stay as they are. UI text is Turkish. `apps/web/src/server/bundle-safety.test.ts` must still pass.
TOUCH:       apps/web/src/app/filo/[uuid]/page.tsx, apps/web/src/app/filo/[uuid]/actions.ts, apps/web/src/app/filo/[uuid]/actions.test.ts, apps/web/src/components/uygulama-islemleri.tsx, apps/web/src/components/env-formu.tsx, apps/web/src/components/dagitim-durumu.tsx
DONE WHEN:   cd /Users/talhabera/Projects/tower-app && pnpm typecheck && pnpm lint && pnpm test && pnpm build
NON-GOALS:   Stop. Showing or editing current env values. Deleting env vars. Preview env copies. Streaming deployment logs (status only). Bulk actions across several apps. Labels for the new actions on `/denetim` (it shows the raw action text, which is fine).

## Context

- Page: `apps/web/src/app/filo/[uuid]/page.tsx` loads the app, deployments, env keys and logs in one `Promise.all` and renders `Kart` / `ResultSection` blocks. Put an "İşlemler" card right under the header (restart, deploy) and the env form right under the "Ortam değişkeni anahtarları" section.
- Server action pattern, messages and `revalidatePath`: `apps/web/src/app/yedekleme/actions.ts`; its test: `actions.test.ts` next to it. Client form pattern with `useActionState`: `apps/web/src/components/yedek-ac-butonu.tsx`, `koru-formu.tsx`.
- Coolify error kind `unreachable` means the request may have reached Coolify (timeout): say "Sonuç belirsiz; tekrar denemeden önce son dağıtımları kontrol edin." instead of offering a retry, as `yedekleme/actions.ts` does.
- Deployment status comes from `getDeployment` (`@tower/coolify`, read) via a server action `dagitimDurumuAction(deploymentUuid)` that validates the uuid shape and returns only `{ status, updatedAt }`.

## Behaviour

- Restart and deploy buttons: first click turns the button into "Onayla: <app adı> restart edilsin mi?" plus "Vazgeç"; the second click submits. Same for deploy ("deploy edilsin mi?").
- Env form: a textarea (monospace, `autoComplete="off"`, `spellCheck={false}`), help text "Her satıra KEY=VALUE. Değer olduğu gibi kaydedilir, tırnaklar silinmez. Mevcut değerler gösterilmez.", a checkbox "Kaydettikten sonra restart et" (default off) and a "Kaydet" button. Success message: "N değişken kaydedildi (yeni: A, güncellenen: B)." plus, without restart, "Yeni değerler restart sonrası geçerli." When `buildTime` is non-empty add "Build-time değişkenler değişti (X): deploy gerekir." Parse errors show line and key, never the value. `partial` shows which names were saved and which failed.
- Status: when an action returns a `deploymentUuid`, `dagitim-durumu.tsx` polls `dagitimDurumuAction` every 5 s, shows the status with the existing `DurumRozeti` style, stops on `finished`, `failed` or `cancelled-by-user`, or after 10 minutes ("Durum 10 dakikadır değişmedi; Coolify panelinden bakın."), then calls `router.refresh()` so the deployments list updates.
- Tests in `actions.test.ts`: non-writer gets the yetki message and no port call; a sentinel env value never appears in the returned action state; `unreachable` maps to the belirsiz message; `dagitimDurumuAction` rejects a malformed uuid.

## Steps

1. Write `actions.test.ts`.
2. Implement `actions.ts`, the three components and the page changes.
3. Run the DONE WHEN command and paste its output in your report.
