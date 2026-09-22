export type ResourceState = "running" | "exited" | "restarting" | "degraded" | "unknown";
export type ResourceHealth = "healthy" | "unhealthy" | "unknown";

export type ResourceStatus = {
  raw: string;
  state: ResourceState;
  health: ResourceHealth;
};

const STATES: ResourceState[] = ["running", "exited", "restarting", "degraded"];
const HEALTHS: ResourceHealth[] = ["healthy", "unhealthy"];

/**
 * Coolify "running:healthy" biçiminde durum döner.
 * "running:unknown" yaygındır ve healthcheck tanımsız demektir — yeşil DEĞİLDİR.
 */
export function parseStatus(raw: string | null | undefined): ResourceStatus {
  const text = (raw ?? "").trim();
  const [statePart = "", healthPart = ""] = text.split(":");

  const state = STATES.find((s) => s === statePart) ?? "unknown";
  const health = HEALTHS.find((h) => h === healthPart) ?? "unknown";

  return { raw: text, state, health };
}
