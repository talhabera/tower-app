export type CoolifyErrorKind =
  | "unreachable"
  | "unauthorized"
  | "rate_limited"
  | "not_found"
  | "malformed";

export type CoolifyError = {
  kind: CoolifyErrorKind;
  message: string;
  status?: number;
};

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: CoolifyError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(
  kind: CoolifyErrorKind,
  message: string,
  status?: number,
): Result<T> {
  return { ok: false, error: { kind, message, status } };
}

export function isOk<T>(r: Result<T>): r is { ok: true; value: T } {
  return r.ok;
}
