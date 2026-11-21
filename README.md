# Tower

A control room for a self-hosted [Coolify](https://coolify.io) fleet. Tower reads the Coolify API and shows, on one screen, which servers are unreachable, which resources are down, which apps have no health check and which databases have no backup. It can also fix the backup gap: one action adds a backup schedule to every unprotected database, and every write is recorded in an audit log.

The UI is in Turkish.

## What it does

| Page | Purpose |
| --- | --- |
| `/` | Risk summary: unreachable servers, down resources, apps without health checks, databases without backups |
| `/filo`, `/filo/[uuid]` | The fleet: servers, projects, environments and their resources |
| `/yedekleme` | Backup coverage per database, enable a backup, protect all unprotected databases |
| `/yedekleme/preset` | The backup preset (schedule, retention, S3 target) applied by those actions |
| `/denetim` | Audit log of every write, including writes that were interrupted |

## Design choices

- **Read-only by default.** `@tower/coolify` exports only read calls. Writes live behind a separate entry, `@tower/coolify/write`, and the app reaches it through a single function, `performWrite`.
- **Fail-closed audit.** `performWrite` records a pending audit row before calling Coolify and refuses to write if the audit database is unavailable. A crash between the two leaves a visible pending row instead of an unrecorded change.
- **Secrets never reach the UI or the fixtures.** Coolify returns some secrets in plaintext (database passwords, S3 keys, webhook secrets). `redact.ts` and `mask.ts` strip them, and the list functions copy only known-safe fields.
- **Errors as values.** The client returns `Result` types. One failing project or environment marks only that node as failed; the rest of the fleet still renders.
- **Fixture-based tests.** `packages/coolify/src/fixtures/` holds captured API responses with secrets redacted and with hosts, IPs and identifiers replaced by placeholders.
- **OIDC login.** Sign-in goes through an OpenID Connect provider (`openid-client`). Write access is a separate allowlist of verified emails.

## Stack

- pnpm workspace with Turborepo, Node 26, TypeScript strict
- `apps/web`: Next.js 16 (App Router), React 19, Tailwind CSS v4
- `packages/coolify`: typed Coolify API client, risk analysis, redaction
- `packages/db`: Drizzle ORM on Postgres, for the audit log and the backup preset
- Vitest for tests

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Fill `.env.local` at the repo root:

| Variable | Meaning |
| --- | --- |
| `COOLIFY_URL`, `COOLIFY_TOKEN` | Your Coolify panel and an API token |
| `NEXAUTH_ISSUER`, `TOWER_OIDC_CLIENT_ID`, `TOWER_OIDC_CLIENT_SECRET` | OIDC provider and client credentials |
| `TOWER_BASE_URL` | Public URL of Tower, used for the login redirect |
| `TOWER_SESSION_SECRET` | Session key, at least 32 bytes |
| `TOWER_WRITER_EMAILS` | Comma-separated emails allowed to write. Empty means nobody can write |
| `DATABASE_URL` | Postgres for the audit log and preset. Empty disables writes |

Always run `pnpm install` from the repo root, never from `apps/web`.

## Verify

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm --filter @tower/db test:db   # needs Docker; Postgres integration tests
```

## Layout

```
apps/web            Next.js app: pages, OIDC session, performWrite, audit
packages/coolify    Coolify client (read entry and separate write entry), risks, redaction, fixtures
packages/db         Drizzle schema and migrations: audit_log, backup_preset
docs/               Specs and implementation plans for each phase
```
