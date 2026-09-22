import type { AuditRow } from "@tower/db";

const INTERRUPTED_MS = 5 * 60_000;

/** 5 dakikadan eski `pending` satır "yarıda kaldı" sayılır (arka plan işi yok). */
export function auditDisplayStatus(
  row: Pick<AuditRow, "status" | "createdAt">,
  now: number,
): "ok" | "failed" | "pending" | "interrupted" {
  if (row.status === "pending" && now - row.createdAt.getTime() > INTERRUPTED_MS) return "interrupted";
  return row.status;
}
