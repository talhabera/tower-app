import { err, ok, type Result } from "./result";

export type CoolifyConfig = {
  baseUrl: string;
  token: string;
};

export function readConfig(env: Record<string, string | undefined>): Result<CoolifyConfig> {
  const rawUrl = env.COOLIFY_URL?.trim();
  const token = env.COOLIFY_TOKEN?.trim();

  if (!rawUrl) return err("malformed", "COOLIFY_URL tanımlı değil");
  if (!token) return err("malformed", "COOLIFY_TOKEN tanımlı değil");

  return ok({ baseUrl: rawUrl.replace(/\/+$/, ""), token });
}
