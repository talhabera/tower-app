const RULES: Array<[RegExp, string]> = [
  // KEY=value — anahtar adı gizli bilgi ima ediyorsa (case-insensitive, keyword anywhere in key)
  [/\b([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|PRIVATE_KEY)[A-Za-z0-9_]*)=\S+/gi, "$1=***"],
  // Bağlantı dizesindeki parola
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1***@"],
  // Authorization: Bearer xxx (case-insensitive Bearer)
  [/\b([Bb][Ee][Aa][Rr][Ee][Rr])\s+[A-Za-z0-9._~+/-]{12,}=*/g, "$1 ***"],
  // Serbest dolaşan uzun sır benzeri diziler
  [/\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g, "***"],
];

/**
 * Metindeki gizli bilgi benzeri desenleri maskeler.
 * Log render'ı ve fixture kaydı öncesi ZORUNLU olarak uygulanır.
 */
export function maskSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RULES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
