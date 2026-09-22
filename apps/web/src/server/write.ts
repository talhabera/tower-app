import "server-only";
import { redactJson, type CoolifyErrorKind } from "@tower/coolify";
import type { AuditAction, TowerStore } from "@tower/db";
import { isWriter } from "./writers";

export type WriteErrorKind = CoolifyErrorKind | "forbidden" | "db" | "needs_s3" | "partial";
export type WriteError = { kind: WriteErrorKind; message: string };
export type StepResult<T> = { ok: true; value: T } | { ok: false; error: WriteError };
export type WriteOutcome<T> =
  | { ok: true; value: T; auditId: string }
  | { ok: false; error: WriteError; auditId?: string };

export type WriteDeps = { store: TowerStore | null; writers: string | undefined };

export type WriteRequest = {
  actorEmail: string;
  action: AuditAction;
  target: string | null;
  payload: unknown;
  parentId?: string | null;
};

/**
 * Tüm yazmaların TEK geçidi. Sıra sabittir:
 * 1) yazıcı değilse forbidden (denetim satırı yok — hiçbir şey denenmedi),
 * 2) denetim satırı `pending` — yazılamazsa `db` hatası ve fn ÇAĞRILMAZ,
 * 3) fn(auditId),
 * 4) denetim satırı `ok | failed`. Bu adım patlarsa yazma zaten gerçekleşmiştir;
 *    sonuç yine döner, satır `pending` kalır ve /denetim "yarıda kaldı" gösterir.
 */
export async function performWrite<T>(
  deps: WriteDeps,
  req: WriteRequest,
  fn: (auditId: string) => Promise<StepResult<T>>,
): Promise<WriteOutcome<T>> {
  if (!isWriter(req.actorEmail, deps.writers)) {
    return { ok: false, error: { kind: "forbidden", message: "Bu işlem için yazma yetkiniz yok." } };
  }
  if (!deps.store) {
    return { ok: false, error: { kind: "db", message: "DATABASE_URL tanımlı değil; yazma kapalı." } };
  }

  let auditId: string;
  try {
    auditId = await deps.store.appendAudit({
      actorEmail: req.actorEmail,
      action: req.action,
      target: req.target,
      payload: redactJson(req.payload),
      parentId: req.parentId ?? null,
    });
  } catch {
    return { ok: false, error: { kind: "db", message: "Denetim kaydı yazılamadı; işlem yapılmadı." } };
  }

  let result: StepResult<T>;
  try {
    result = await fn(auditId);
  } catch {
    result = { ok: false, error: { kind: "malformed", message: "İşlem beklenmedik şekilde durdu." } };
  }

  try {
    await deps.store.finishAudit(
      auditId,
      result.ok
        ? { status: "ok", errorKind: null, result: redactJson(result.value) }
        : { status: "failed", errorKind: result.error.kind, result: null },
    );
  } catch {
    console.error(`[tower] denetim satırı kapatılamadı: ${auditId}`);
  }

  return result.ok ? { ok: true, value: result.value, auditId } : { ok: false, error: result.error, auditId };
}
