const RULES: Array<[RegExp, string]> = [
  // KEY=value — anahtar adı gizli bilgi ima ediyorsa (case-insensitive, keyword anywhere in key)
  [/\b([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|PRIVATE_KEY)[A-Za-z0-9_]*)=\S+/gi, "$1=***"],
  // Bağlantı dizesindeki parola
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1***@"],
  // Parolasız userinfo (ör. https://TOKEN@github.com/...) — kullanıcı adı yerine token taşıyabilir
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^:@\s/]+@/gi, "$1***@"],
  // Authorization: Bearer xxx (case-insensitive Bearer, any token length)
  [/\b([Bb][Ee][Aa][Rr][Ee][Rr])\s+\S+/g, "$1 ***"],
  // Serbest dolaşan uzun sır benzeri diziler
  [/\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g, "***"],
  // Spec: 20+ karakterlik rastgele görünen diziler. Düz kelimeleri ve yolları
  // bozmamak için harf VE rakam içermesi ve "/" içermemesi şartı aranır.
  [/\b(?=[A-Za-z0-9_-]*[0-9])(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{20,}\b/g, "***"],
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
