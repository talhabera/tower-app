/** Virgülle ayrılmış e-posta listesi; kırpılmış, küçük harf, boşlar atılmış. */
export function parseEmailList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** TOWER_WRITER_EMAILS boş/tanımsızsa kimse yazamaz (fail closed). */
export function isWriter(email: string, raw: string | undefined): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return parseEmailList(raw).has(normalized);
}
