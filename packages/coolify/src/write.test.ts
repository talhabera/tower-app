import { describe, expect, it, vi } from "vitest";
import * as root from "./index";
import { backupScheduleBody, createBackupSchedule, createWriteClient } from "./write";

const config = { baseUrl: "https://panel.example.app", token: "t0ken" };
const input = { frequency: "0 3 * * *", s3StorageUuid: "ys1gbsu8rpv8pau8alksmfji", keepLocal: 7, keepS3: 30 };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("@tower/coolify/write", () => {
  it("kök giriş yazma metodlarını dışa aktarmaz", () => {
    expect("createBackupSchedule" in root).toBe(false);
    expect("createWriteClient" in root).toBe(false);
  });

  it("preset'i Coolify gövdesine çevirir", () => {
    expect(backupScheduleBody(input)).toEqual({
      frequency: "0 3 * * *",
      enabled: true,
      save_s3: true,
      s3_storage_uuid: "ys1gbsu8rpv8pau8alksmfji",
      database_backup_retention_amount_locally: 7,
      database_backup_retention_amount_s3: 30,
    });
  });

  it("POST ile JSON gövde gönderir ve oluşan uuid'i döner", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ uuid: "b-1", message: "ok" }, 201));
    const http = createWriteClient(config, fetchImpl as unknown as typeof fetch);
    const r = await createBackupSchedule(http, "db-1", input);

    expect(r).toEqual({ ok: true, value: { uuid: "b-1" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://panel.example.app/api/v1/databases/db-1/backups");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual(backupScheduleBody(input));
  });

  it("geçersiz uuid'de ağa hiç gitmez", async () => {
    const fetchImpl = vi.fn();
    const http = createWriteClient(config, fetchImpl as unknown as typeof fetch);
    const r = await createBackupSchedule(http, "../../servers", input);
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("422'yi durum koduyla malformed döner", async () => {
    const http = createWriteClient(config, (async () => jsonResponse({ message: "invalid" }, 422)) as unknown as typeof fetch);
    const r = await createBackupSchedule(http, "db-1", input);
    expect(r).toMatchObject({ ok: false, error: { kind: "malformed", status: 422 } });
  });

  it("cevapta uuid yoksa malformed döner", async () => {
    const http = createWriteClient(config, (async () => jsonResponse({ message: "ok" }, 201)) as unknown as typeof fetch);
    const r = await createBackupSchedule(http, "db-1", input);
    expect(r).toMatchObject({ ok: false, error: { kind: "malformed" } });
  });

  it("ağ hatasında unreachable döner ve token'ı mesaja sızdırmaz", async () => {
    const http = createWriteClient(config, (async () => {
      throw new Error("boom t0ken");
    }) as unknown as typeof fetch);
    const r = await createBackupSchedule(http, "db-1", input);
    expect(r).toMatchObject({ ok: false, error: { kind: "unreachable" } });
    if (!r.ok) expect(r.error.message).not.toContain("t0ken");
  });
});
