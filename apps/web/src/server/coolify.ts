import "server-only";
import { createClient, readConfig, type CoolifyHttp, type Result } from "@tower/coolify";

/** Test edilebilirlik için env dışarıdan verilir. */
export function buildCoolify(env: Record<string, string | undefined>): Result<CoolifyHttp> {
  const config = readConfig(env);
  if (!config.ok) return config;
  return { ok: true, value: createClient(config.value) };
}

let cached: Result<CoolifyHttp> | null = null;

export function getCoolify(): Result<CoolifyHttp> {
  cached ??= buildCoolify(process.env);
  return cached;
}
