import { describe, expect, it, vi } from "vitest";
import * as root from "./index";
import { err, ok, type Result } from "./result";
import {
  backupScheduleBody,
  createBackupSchedule,
  createWriteClient,
  deployApplication,
  restartApplication,
  upsertApplicationEnv,
  type CoolifyWriteHttp,
} from "./write";

const config = { baseUrl: "https://panel.example.app", token: "t0ken" };
const input = { frequency: "0 3 * * *", s3StorageUuid: "ys1gbsu8rpv8pau8alksmfji", keepLocal: 7, keepS3: 30 };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("@tower/coolify/write", () => {
  it("kök giriş yazma metodlarını dışa aktarmaz", () => {
    expect("createBackupSchedule" in root).toBe(false);
    expect("createWriteClient" in root).toBe(false);
    expect("restartApplication" in root).toBe(false);
    expect("deployApplication" in root).toBe(false);
    expect("upsertApplicationEnv" in root).toBe(false);
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

function fakeHttp(response: Result<unknown>) {
  const get = vi.fn(async () => response);
  const post = vi.fn(async () => response);
  const patch = vi.fn(async () => response);
  const http = { get, post, patch } as unknown as CoolifyWriteHttp;
  return { http, get, post, patch };
}

describe("restartApplication", () => {
  it("restart uç noktasına POST eder ve deploymentUuid döner", async () => {
    const f = fakeHttp(ok({ message: "Restart request queued.", deployment_uuid: "d-1" }));
    const r = await restartApplication(f.http, "app-1");

    expect(r).toEqual({ ok: true, value: { deploymentUuid: "d-1" } });
    expect(f.post).toHaveBeenCalledTimes(1);
    expect(f.post.mock.calls[0]).toEqual(["/applications/app-1/restart", undefined]);
    expect(f.patch).not.toHaveBeenCalled();
  });

  it("deployment_uuid olmayan 200'ü malformed döner", async () => {
    const f = fakeHttp(ok({ message: "Restart request queued." }));
    const r = await restartApplication(f.http, "app-1");
    expect(r).toMatchObject({ ok: false, error: { kind: "malformed" } });
  });

  it("boş deployment_uuid'i malformed döner", async () => {
    const f = fakeHttp(ok({ deployment_uuid: "" }));
    const r = await restartApplication(f.http, "app-1");
    expect(r).toMatchObject({ ok: false, error: { kind: "malformed" } });
  });

  it("http hatasını olduğu gibi döner", async () => {
    const f = fakeHttp(err("not_found", "Kaynak bulunamadı", 404));
    const r = await restartApplication(f.http, "app-1");
    expect(r).toMatchObject({ ok: false, error: { kind: "not_found", status: 404 } });
  });

  it("geçersiz uuid'de http'yi hiç çağırmaz", async () => {
    const f = fakeHttp(ok({ deployment_uuid: "d-1" }));
    const r = await restartApplication(f.http, "../x");
    expect(r.ok).toBe(false);
    expect(f.get).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
    expect(f.patch).not.toHaveBeenCalled();
  });
});

describe("deployApplication", () => {
  it("/deploy?uuid=<uuid>&force=false'a POST eder ve ilk deployment_uuid'i döner", async () => {
    const f = fakeHttp(
      ok({
        deployments: [
          { message: "queued", resource_uuid: "app-1", deployment_uuid: "d-1" },
          { message: "queued", resource_uuid: "app-1", deployment_uuid: "d-2" },
        ],
      }),
    );
    const r = await deployApplication(f.http, "app-1");

    expect(r).toEqual({ ok: true, value: { deploymentUuid: "d-1" } });
    expect(f.post).toHaveBeenCalledTimes(1);
    expect(f.post.mock.calls[0]).toEqual(["/deploy?uuid=app-1&force=false", undefined]);
  });

  it("boş deployments dizisini malformed döner", async () => {
    const f = fakeHttp(ok({ deployments: [] }));
    const r = await deployApplication(f.http, "app-1");
    expect(r).toMatchObject({ ok: false, error: { kind: "malformed" } });
  });

  it("deployments alanı yoksa malformed döner", async () => {
    const f = fakeHttp(ok({ message: "ok" }));
    const r = await deployApplication(f.http, "app-1");
    expect(r).toMatchObject({ ok: false, error: { kind: "malformed" } });
  });

  it("ilk kayıtta deployment_uuid yoksa malformed döner", async () => {
    const f = fakeHttp(ok({ deployments: [{ message: "queued", resource_uuid: "app-1" }] }));
    const r = await deployApplication(f.http, "app-1");
    expect(r).toMatchObject({ ok: false, error: { kind: "malformed" } });
  });

  it("geçersiz uuid'de http'yi hiç çağırmaz", async () => {
    const f = fakeHttp(ok({ deployments: [{ deployment_uuid: "d-1" }] }));
    const r = await deployApplication(f.http, "app-1&force=true");
    expect(r.ok).toBe(false);
    expect(f.get).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
    expect(f.patch).not.toHaveBeenCalled();
  });
});

describe("upsertApplicationEnv", () => {
  const SENTINEL = "SENTINEL-VALUE-7f3a";

  it("exists true iken PATCH gönderir ve created false döner", async () => {
    const f = fakeHttp(ok({ uuid: "e-1" }));
    const r = await upsertApplicationEnv(f.http, "app-1", { key: "API_URL", value: SENTINEL, exists: true });

    expect(r).toEqual({ ok: true, value: { key: "API_URL", created: false } });
    expect(f.post).not.toHaveBeenCalled();
    expect(f.patch).toHaveBeenCalledTimes(1);
    expect(f.patch.mock.calls[0]).toEqual([
      "/applications/app-1/envs",
      { key: "API_URL", value: SENTINEL, is_preview: false },
    ]);
  });

  it("exists false iken POST gönderir ve created true döner", async () => {
    const f = fakeHttp(ok({ uuid: "e-1" }));
    const r = await upsertApplicationEnv(f.http, "app-1", { key: "API_URL", value: SENTINEL, exists: false });

    expect(r).toEqual({ ok: true, value: { key: "API_URL", created: true } });
    expect(f.patch).not.toHaveBeenCalled();
    expect(f.post).toHaveBeenCalledTimes(1);
    expect(f.post.mock.calls[0]).toEqual([
      "/applications/app-1/envs",
      { key: "API_URL", value: SENTINEL, is_preview: false },
    ]);
  });

  it("sonuçta value alanı yoktur ve değer sızmaz", async () => {
    const f = fakeHttp(ok({ uuid: "e-1", value: SENTINEL }));
    const r = await upsertApplicationEnv(f.http, "app-1", { key: "API_URL", value: SENTINEL, exists: true });

    expect(r.ok).toBe(true);
    if (r.ok) expect("value" in r.value).toBe(false);
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
  });

  it("http hatasında değer hata sonucuna sızmaz", async () => {
    for (const exists of [true, false]) {
      const f = fakeHttp(err("malformed", "Beklenmeyen durum kodu: 422", 422));
      const r = await upsertApplicationEnv(f.http, "app-1", { key: "API_URL", value: SENTINEL, exists });
      expect(r).toMatchObject({ ok: false, error: { kind: "malformed", status: 422 } });
      expect(JSON.stringify(r)).not.toContain(SENTINEL);
    }
  });

  it("gerçek istemcide 404'te değer hata sonucuna sızmaz", async () => {
    const http = createWriteClient(config, (async () => jsonResponse({ message: SENTINEL }, 404)) as unknown as typeof fetch);
    const r = await upsertApplicationEnv(http, "app-1", { key: "API_URL", value: SENTINEL, exists: true });
    expect(r).toMatchObject({ ok: false, error: { kind: "not_found" } });
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
  });

  it("geçersiz uuid'de http'yi hiç çağırmaz ve değeri sızdırmaz", async () => {
    const f = fakeHttp(ok({ uuid: "e-1" }));
    const r = await upsertApplicationEnv(f.http, "../x", { key: "API_URL", value: SENTINEL, exists: false });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
    expect(f.get).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
    expect(f.patch).not.toHaveBeenCalled();
  });
});
