# 01 @tower/coolify: restart, deploy, env write and deployment status

Status: ready-for-agent

worker: auto

GOAL:        `@tower/coolify/write` can restart and deploy an application and create or update its env vars, and the read-only root entry can read one deployment's status, all tested against fixtures.
CONSTRAINTS: The root entry `@tower/coolify` stays read-only: it must not export any function or type that sends POST or PATCH. New write functions live in `packages/coolify/src/write.ts` and are reached only through `@tower/coolify/write`. Env values are write-only: no function returns, logs or puts an env value in an error message. `getDeployment` copies only safe fields; the Coolify response carries `logs`, `configuration_snapshot` and `configuration_diff`, which must never cross the package boundary. Every uuid passes through `seg()` before it goes into a path. No network in tests: fake `fetch` or a fake `CoolifyWriteHttp`, as the existing tests do.
TOUCH:       packages/coolify/src/http.ts, packages/coolify/src/http.test.ts, packages/coolify/src/write.ts, packages/coolify/src/write.test.ts, packages/coolify/src/api.ts, packages/coolify/src/api.test.ts, packages/coolify/src/types.ts, packages/coolify/src/fixtures/deployment-detail.json
DONE WHEN:   cd /Users/talhabera/Projects/tower-app && pnpm --filter @tower/coolify typecheck && pnpm --filter @tower/coolify lint && pnpm --filter @tower/coolify test
NON-GOALS:   Stop, start, delete. Service and database resources (applications only). Bulk env endpoint. Preview env copies (`is_preview: true`). Any UI or server action (issues 02 and 03).

## Context

- Coolify is v4.7.0 at `COOLIFY_URL`. Endpoints, from the Coolify OpenAPI (`coollabsio/coolify` v4.x `openapi.json`) and, where marked, verified against prod on 2026-11-09:
  - `POST /applications/{uuid}/restart`, no body. 200: `{ "message": "Restart request queued.", "deployment_uuid": "..." }`. Verified in prod (GET returns 405).
  - `POST /deploy?uuid={uuid}&force=false`, no body. 200: `{ "deployments": [ { "message", "resource_uuid", "deployment_uuid" } ] }`.
  - `POST /applications/{uuid}/envs`, body `{ "key", "value", "is_preview": false }`: creates a var. 201.
  - `PATCH /applications/{uuid}/envs`, body `{ "key", "value", "is_preview": false }`: updates an existing var. 201. Verified in prod for `APP_URL`. 404 when the key does not exist.
  - `GET /deployments/{uuid}`: `ApplicationDeploymentQueue`. Safe fields: `deployment_uuid`, `application_name`, `status` (`queued`, `in_progress`, `finished`, `failed`, `cancelled-by-user`), `created_at`, `updated_at`, `restart_only`, `commit`. Everything else stays out.
- `http.ts`: `CoolifyWriteHttp` has `get` and `post`; `Method` is `"GET" | "POST"`. Add `patch` and `"PATCH"`. Keep the timeout, the error mapping and `maskSecrets` on error bodies as they are.
- Pattern to copy: `createBackupSchedule` in `write.ts` (seg, call, check the response shape, `err("malformed", ...)` when a required field is missing). Read pattern: `listApplicationDeployments` in `api.ts` (copies only safe fields, comment says why `logs` is skipped).
- `docs/superpowers/specs/2026-09-22-tower-phase2a-backups-design.md` lists this as phase 2A.2.

## Steps

1. Tests first in `write.test.ts`, `http.test.ts` and `api.test.ts`:
   - `restartApplication(http, uuid)` posts to `/applications/<uuid>/restart` and returns `{ deploymentUuid }`; a 200 without `deployment_uuid` is `malformed`; a bad uuid (`"../x"`) never calls http.
   - `deployApplication(http, uuid)` posts to `/deploy?uuid=<uuid>&force=false` and returns the first `deployment_uuid`; an empty `deployments` array is `malformed`.
   - `upsertApplicationEnv(http, uuid, { key, value, exists })` sends PATCH when `exists` is true and POST when false, always with `is_preview: false`, and returns `{ key, created }`. The returned object has no `value` field. An error result's message does not contain the value (use a sentinel value like `SENTINEL-VALUE-7f3a` and assert it appears nowhere in the serialized result).
   - `getDeployment(http, uuid)` maps a fixture to `{ uuid, applicationName, status, createdAt, updatedAt, restartOnly }`; the serialized result contains no `logs` text from the fixture.
   - `patch` on the write client sends method PATCH with a JSON body.
2. Add `deployment-detail.json` fixture by hand (fake values, include a `logs` field with a fake secret-looking line so the test proves it is dropped).
3. Implement. `getDeployment` and its `DeploymentDetail` type go in `api.ts` / `types.ts` (root, read). The three write functions go in `write.ts`.
4. Run the DONE WHEN command and paste its output in your report.
