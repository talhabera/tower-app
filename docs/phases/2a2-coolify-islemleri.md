# Phase: 2a2-coolify-islemleri
issues: .scratch/2a2-coolify-islemleri/issues/
# land: optional; auto lands without asking again, ask waits for approval (default auto)
land: auto
budget: 15 usd
# slots: optional; workers in parallel, 1 to 4 (default 4)
slots: 2
acceptance: cd /Users/talhabera/Projects/tower-app && pnpm typecheck && pnpm lint && pnpm test && pnpm build

# GOAL: optional; the phase outcome in one sentence
GOAL: Talha restarts and deploys Coolify applications and sets their env vars from /filo/<uuid> in Tower, every write audited on /denetim without env values, so these jobs stop going through Claude Code and curl.
# CONSTRAINTS: optional; what must not change
CONSTRAINTS: Coolify writes only through performWrite in apps/web/src/server/write.ts; @tower/coolify root entry stays read-only; env values are write-only and never reach the audit log, the browser or a log line; no DB migration and nothing run against DATABASE_URL; nothing pushed to origin.
# NON-GOALS: optional; what this phase deliberately skips
NON-GOALS: Stop/start/delete, preview env copies, showing current env values, deployment log streaming, services and databases, deploying Tower itself, phase 2B templates.
