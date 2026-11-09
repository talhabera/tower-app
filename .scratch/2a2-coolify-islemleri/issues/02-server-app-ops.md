# 02 server: audited restart, deploy and env set through performWrite

Status: ready-for-agent
Blocked by: 01

worker: auto

GOAL:        `apps/web/src/server/app-ops.ts` exposes `restartApp`, `deployApp`, `setEnvs` and `parseEnvText`, each write running through `performWrite` with an audit row that never contains an env value, plus `appOpsPorts()` that wires the real Coolify clients.
CONSTRAINTS: `performWrite` in `apps/web/src/server/write.ts` stays unchanged and remains the only path to Coolify writes; `@tower/coolify/write` is imported only in `app-ports.ts` (same rule as `backup-ports.ts`). No DB migration: `audit_log.action` is plain text, so extending the TypeScript `AuditAction` union is enough. Never run `db:migrate` or anything against `DATABASE_URL`. Env values never go into the audit payload, the audit result, a returned value, a thrown error or a log line. Do not name a payload field `key` (`redactJson` blanks it): use `name`.
TOUCH:       apps/web/src/server/app-ops.ts, apps/web/src/server/app-ops.test.ts, apps/web/src/server/app-ports.ts, packages/db/src/store.ts, .env.example, CLAUDE.md
DONE WHEN:   cd /Users/talhabera/Projects/tower-app && pnpm --filter @tower/db typecheck && pnpm --filter @tower/web typecheck && pnpm --filter @tower/web lint && pnpm --filter @tower/web test
NON-GOALS:   UI and server actions (issue 03). Stop. Preview env copies. Reading or showing current env values. Changing `redactJson`.

## Context

- Gate: `performWrite(deps, { actorEmail, action, target, payload, parentId }, fn)` in `apps/web/src/server/write.ts`. It checks `TOWER_WRITER_EMAILS`, writes a `pending` audit row, runs `fn`, then closes the row. Copy how `apps/web/src/server/backups.ts` uses it, and the ports split from `apps/web/src/server/backup-ports.ts` (the write client is created only in the ports file; logic takes ports so tests inject fakes).
- `AuditAction` is in `packages/db/src/store.ts`: add `"app.restart" | "app.deploy" | "env.set"`.
- Current env keys come from `listApplicationEnvKeys` (`@tower/coolify`, returns `{ key, isBuildTime, isPreview }`, never values). Use it to decide create vs update and to know whether a changed key is build-time.
- Write functions from issue 01: `restartApplication`, `deployApplication`, `upsertApplicationEnv` in `@tower/coolify/write`.
- `.env.example` still says `COOLIFY_URL=https://panel.example.app`; the panel moved to `https://panel.example.app`.

## Behaviour

- `parseEnvText(text)`: one `KEY=VALUE` per line; blank lines and lines starting with `#` are skipped; the key is the text before the first `=`, trimmed, and must match `^[A-Z_][A-Z0-9_]*$`; the value is everything after the first `=`, taken verbatim (no quote stripping, no trimming of inner spaces; strip only a trailing `\r`). Reject: no `=`, bad key, duplicate key, more than 20 lines, a value over 8192 chars. Errors name the line number and the key, never the value.
- `setEnvs(deps, ports, actor, app: { uuid, name }, entries, { restartAfter })`:
  - One `env.set` audit row, `target` = app uuid, payload `{ app: name, names: [...] }`.
  - Reads current keys once (non-preview only), then upserts each entry in order. Result `{ created: string[], updated: string[], buildTime: string[] }` (names only; `buildTime` = changed keys whose existing var is build-time).
  - A failure mid-list stops, returns kind `partial` with `detail` `{ done: [...names], failedAt: name }`.
  - `restartAfter` true and all entries ok: run `restartApp` as a second `performWrite` with `parentId` = the env audit id.
- `restartApp` / `deployApp`: audit `app.restart` / `app.deploy`, payload `{ app: name }`, result `{ deploymentUuid }`.
- Tests (vitest, fake ports and a fake store, as in `backups.test.ts`): non-writer gets `forbidden` and no port is called; audit payload and result for `setEnvs` never contain a sentinel value (`JSON.stringify` of every store call); create vs update chosen from the key list; preview keys are ignored when deciding; `partial` detail; `restartAfter` child row has `parentId`; `parseEnvText` cases above.

## Steps

1. Write `app-ops.test.ts` with the cases above.
2. Extend `AuditAction`, write `app-ops.ts` and `app-ports.ts`.
3. Update `.env.example` (`COOLIFY_URL=https://panel.example.app`) and in `CLAUDE.md` change "read-only + backup writes" to say the token needs Coolify `write` and `deploy` permissions.
4. Run the DONE WHEN command and paste its output in your report.
