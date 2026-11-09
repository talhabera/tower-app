# 04 Talha: Coolify token permissions and one live run

Status: ready-for-human
Blocked by: 03

worker: auto

GOAL:        Tower's `COOLIFY_TOKEN` has the `write` and `deploy` permissions, and one restart plus one env update done from `/filo/<uuid>` on a non-critical app show up in Coolify and on `/denetim` with no env value in the audit row.
CONSTRAINTS: Done by Talha by hand: the token lives in `/Users/talhabera/Projects/tower-app/.env.local` and is never pasted into chat, a commit or a log. The token contains `|`: edit the file in an editor, never `source` it. Pick a test app whose restart nobody notices (not relay-web, relay-worker, relay-cron or clientc-web). Use a throwaway env key such as `TOWER_SMOKE=1` and delete it afterwards in the Coolify panel.
TOUCH:       (none, no repo files)
DONE WHEN:   cd /Users/talhabera/Projects/tower-app && pnpm test
NON-GOALS:   Deploying Tower itself to Coolify. Rotating other secrets.

## Steps

1. In `https://panel.example.app`, Keys & Tokens, check the token Tower uses. If it lacks `write` or `deploy`, create a new token with `read`, `write` and `deploy` (not `root`, not `read:sensitive`) and put it in `COOLIFY_TOKEN` in `tower-app/.env.local`.
2. Run `pnpm dev` in `tower-app`, log in, open `/filo`, open the test app.
3. Paste `TOWER_SMOKE=1` into the env form, save. Expected: "1 değişken kaydedildi (yeni: TOWER_SMOKE ...)".
4. Click restart, confirm. Expected: the status line moves from `queued` or `in_progress` to `finished`.
5. Open `/denetim`. Expected: an `env.set` row whose payload lists `TOWER_SMOKE` and no `1` value field, and an `app.restart` row, both `ok`.
6. Delete `TOWER_SMOKE` in the Coolify panel.
