import type { CoolifyConfig } from "./config";
import { err, ok, type Result } from "./result";
import { maskSecrets } from "./mask";

const TIMEOUT_MS = 20_000;

export type CoolifyHttp = {
  get<T>(path: string): Promise<Result<T>>;
};

export function createClient(
  config: CoolifyConfig,
  fetchImpl: typeof fetch = fetch,
): CoolifyHttp {
  return {
    async get<T>(path: string): Promise<Result<T>> {
      const url = `${config.baseUrl}/api/v1${path}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        });
      } catch {
        // Hata nesnesi taşınmaz: token içeren istek bağlamı sızabilir.
        return err("unreachable", maskSecrets(`Coolify'a ulaşılamadı: ${path}`));
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 401 || response.status === 403) {
        return err("unauthorized", maskSecrets("Coolify token'ı reddedildi"), response.status);
      }
      if (response.status === 404) {
        return err("not_found", maskSecrets(`Kaynak bulunamadı: ${path}`), 404);
      }
      if (response.status === 429) {
        return err("rate_limited", maskSecrets("Coolify istek sınırı aşıldı"), 429);
      }
      if (!response.ok) {
        return err("malformed", maskSecrets(`Beklenmeyen durum kodu: ${response.status}`), response.status);
      }

      try {
        return ok((await response.json()) as T);
      } catch {
        return err("malformed", maskSecrets(`Cevap JSON değil: ${path}`));
      }
    },
  };
}
