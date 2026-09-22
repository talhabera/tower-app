import { maskSecrets } from "./mask";

const SECRET_KEY_PATTERN =
  /(token|secret|password|passwd|api_?key|private_?key|credential|webhook)/i;
const SECRET_KEY_EXACT = new Set(["custom_labels", "custom_docker_run_options"]);
const SECRET_KEY_PREFIXES = ["docker_compose", "dockerfile"];

function isSecretKey(key: string): boolean {
  if (SECRET_KEY_PATTERN.test(key)) return true;
  const lower = key.toLowerCase();
  if (SECRET_KEY_EXACT.has(lower)) return true;
  return SECRET_KEY_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Parse edilmiş JSON değerini iki kuralla temizler:
 * 1) Anahtar adı gizli bilgi ima ediyorsa (token, secret, password, passwd,
 *    api_key, private_key, credential, webhook ya da docker_compose,
 *    dockerfile önekli anahtarlar, custom_labels, custom_docker_run_options),
 *    null olmayan değer bütünüyle "***" ile değiştirilir (içine inilmez).
 * 2) Kalan tüm string yapraklar maskSecrets'tan geçirilir.
 * Saf fonksiyondur; girdiyi değiştirmez, yeni bir değer döner.
 * Fixture kaydından önce ZORUNLU olarak uygulanır.
 */
export function redactJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactJson(item));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(key)) {
        out[key] = val === null ? null : "***";
      } else {
        out[key] = redactJson(val);
      }
    }
    return out;
  }
  if (typeof value === "string") {
    return maskSecrets(value);
  }
  return value;
}
