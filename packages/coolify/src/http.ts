import type { CoolifyConfig } from "./config";
import { err, ok, type Result } from "./result";
import { maskSecrets } from "./mask";

const TIMEOUT_MS = 20_000;

export type CoolifyHttp = {
  get<T>(path: string): Promise<Result<T>>;
};

/** Yalnızca `@tower/coolify/write` üzerinden erişilir; kök giriş bu tipi dışa aktarmaz. */
export type CoolifyWriteHttp = CoolifyHttp & {
  post<T>(path: string, body: unknown): Promise<Result<T>>;
};

type Method = "GET" | "POST";

function requester(config: CoolifyConfig, fetchImpl: typeof fetch) {
  return async function send<T>(method: Method, path: string, body?: unknown): Promise<Result<T>> {
    const url = `${config.baseUrl}/api/v1${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await request<T>(method, url, path, body, controller.signal);
    } finally {
      // Zaman aşımı gövde okumasını (response.json()) da kapsar.
      clearTimeout(timer);
    }
  };

  async function request<T>(
    method: Method,
    url: string,
    path: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<Result<T>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch {
      // Hata nesnesi taşınmaz: token içeren istek bağlamı sızabilir.
      return err("unreachable", maskSecrets(`Coolify'a ulaşılamadı: ${path}`));
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
  }
}

export function createClient(config: CoolifyConfig, fetchImpl: typeof fetch = fetch): CoolifyHttp {
  const send = requester(config, fetchImpl);
  return { get: (path) => send("GET", path) };
}

export function createWriteClient(
  config: CoolifyConfig,
  fetchImpl: typeof fetch = fetch,
): CoolifyWriteHttp {
  const send = requester(config, fetchImpl);
  return {
    get: (path) => send("GET", path),
    post: (path, body) => send("POST", path, body),
  };
}
