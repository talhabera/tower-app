## Stack
pnpm workspace (turborepo) + Next.js app. pnpm@11.3.0, Node 26. Single app so far: `apps/web` (`@tower/web`).

## Verify
    pnpm typecheck && pnpm lint && pnpm test && pnpm build
    pnpm --filter @tower/db test:db   # Docker required; Postgres integration tests

## Layout
- `apps/web` — Next.js 16 (App Router, Turbopack, Tailwind v4, TS strict).
- `packages/coolify` — Coolify client; root entry is read-only, `@tower/coolify/write` is write.
- `packages/db` — `@tower/db`: Drizzle + postgres-js; audit log and backup preset.

## Environments
`.env.example` lists all variables. Root `.env.local` holds secrets: `COOLIFY_TOKEN` (read-only + backup writes), `NEXAUTH_ISSUER` / `TOWER_OIDC_CLIENT_ID` / `TOWER_OIDC_CLIENT_SECRET` (NexAuth login), `TOWER_SESSION_SECRET` (session, min 32 bytes), `TOWER_WRITER_EMAILS` (write access: comma-separated, case-insensitive; empty = no write access), `DATABASE_URL` (Tower Postgres: audit log + backup preset; empty = write closed), and `PLANE_URL` / `PLANE_ACCESS_TOKEN` / `PURELYMAIL_TOKEN` (not yet wired into app).

## Gotchas
- `apps/web/next.config.ts` walks up from `__dirname`/`cwd` to find `pnpm-workspace.yaml` and sets `outputFileTracingRoot` + `turbopack.root` to it. A stray `pnpm-workspace.yaml` inside `apps/web` (e.g. from running `pnpm install` there directly, or a fresh `create-next-app` scaffold) shadows the real root and breaks `next build`/`next dev` with "Could not find the Next.js package" — always install from the repo root.
- `apps/web/dev.cjs` and `load-root-env.cjs` are plain CommonJS (`require`) by design — they run before Next/TS are available. eslint has a `**/*.cjs` override turning off `no-require-imports` for them; don't remove it.
- `COOLIFY_TOKEN` contains `|`: don't `source` `.env.local` with shell (value reads empty, you get 401). Use `--env-file` / `process.loadEnvFile`.
- `GET /s3-storages` returns `key` and `secret` in plaintext. Fixture record always passes through `redactJson`; `listS3Storages` only copies safe fields — don't extend this field list.
- Coolify writes only through `performWrite` in `apps/web/src/server/write.ts`; don't import `@tower/coolify/write` elsewhere.
