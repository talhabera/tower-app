## Stack
pnpm workspace (turborepo) + Next.js app. pnpm@11.3.0, Node 26. Single app so far: `apps/web` (`@tower/web`).

## Verify
    pnpm typecheck && pnpm lint && pnpm build

## Layout
- `apps/web` — Next.js 16 (App Router, Turbopack, Tailwind v4, TS strict).
- `packages/` — empty for now; add workspace packages here as the app grows.

## Environments
No deploy target configured yet. Root `.env.local` holds `PLANE_URL` / `PLANE_ACCESS_TOKEN` (Plane) and `COOLIFY_TOKEN` (Coolify) — not yet wired into the app.

## Gotchas
- `apps/web/next.config.ts` walks up from `__dirname`/`cwd` to find `pnpm-workspace.yaml` and sets `outputFileTracingRoot` + `turbopack.root` to it. A stray `pnpm-workspace.yaml` inside `apps/web` (e.g. from running `pnpm install` there directly, or a fresh `create-next-app` scaffold) shadows the real root and breaks `next build`/`next dev` with "Could not find the Next.js package" — always install from the repo root.
- `apps/web/dev.cjs` and `load-root-env.cjs` are plain CommonJS (`require`) by design — they run before Next/TS are available. eslint has a `**/*.cjs` override turning off `no-require-imports` for them; don't remove it.
