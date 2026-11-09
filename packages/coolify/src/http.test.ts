import { describe, expect, it, vi } from "vitest";
import { readConfig } from "./config";
import { createClient, createWriteClient } from "./http";

const config = { baseUrl: "https://panel.example.app", token: "t0ken" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("readConfig", () => {
  it("eksik COOLIFY_URL'i hata olarak döner", () => {
    const r = readConfig({ COOLIFY_TOKEN: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("malformed");
  });

  it("sondaki eğik çizgiyi temizler", () => {
    const r = readConfig({ COOLIFY_URL: "https://a.app/", COOLIFY_TOKEN: "x" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.baseUrl).toBe("https://a.app");
  });

  it("başındaki boşluğu kaldırır", () => {
    const r = readConfig({ COOLIFY_URL: "  https://a.app", COOLIFY_TOKEN: "  test-token" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.baseUrl).toBe("https://a.app");
      expect(r.value.token).toBe("test-token");
    }
  });
});

describe("createClient.get", () => {
  it("/api/v1 önekini ve Bearer başlığını ekler", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ uuid: "a" }]));
    const client = createClient(config, fetchImpl);

    await client.get("/servers");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://panel.example.app/api/v1/servers");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t0ken");
  });

  it("401'i unauthorized'a çevirir", async () => {
    const client = createClient(config, async () => jsonResponse({}, 401));
    const r = await client.get("/servers");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("unauthorized");
  });

  it("403'ü unauthorized'a çevirir", async () => {
    const client = createClient(config, async () => jsonResponse({}, 403));
    const r = await client.get("/servers");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("unauthorized");
  });

  it("404'ü not_found'a çevirir", async () => {
    const client = createClient(config, async () => jsonResponse({}, 404));
    const r = await client.get("/servers/yok");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("not_found");
  });

  it("429'u rate_limited'a çevirir", async () => {
    const client = createClient(config, async () => jsonResponse({}, 429));
    const r = await client.get("/servers");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("rate_limited");
  });

  it("ağ hatasını unreachable'a çevirir", async () => {
    const client = createClient(config, async () => {
      throw new TypeError("fetch failed");
    });
    const r = await client.get("/servers");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("unreachable");
  });

  it("timeout'u unreachable'a çevirir", async () => {
    const client = createClient(config, async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    });
    const r = await client.get("/servers");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("unreachable");
  });

  it("JSON olmayan gövdeyi malformed'a çevirir", async () => {
    const client = createClient(config, async () => new Response("<html>", { status: 200 }));
    const r = await client.get("/servers");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("malformed");
  });

  it("hata mesajında token sızdırmaz", async () => {
    const client = createClient(config, async () => jsonResponse({}, 401));
    const r = await client.get("/servers");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(JSON.stringify(r.error)).not.toContain("t0ken");
  });

  it("gizli bilgileri hata mesajında maskeler", async () => {
    const client = createClient(config, async () => {
      throw new Error("connection error");
    });
    const r = await client.get("/servers?password=hunter2");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const errorStr = JSON.stringify(r.error);
      expect(errorStr).toContain("password=***");
      expect(errorStr).not.toContain("hunter2");
    }
  });
});

describe("createWriteClient.patch", () => {
  it("PATCH metoduyla JSON gövde gönderir", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ uuid: "e-1" }, 201));
    const client = createWriteClient(config, fetchImpl as unknown as typeof fetch);

    const r = await client.patch("/applications/app-1/envs", { key: "A", value: "b", is_preview: false });

    expect(r).toEqual({ ok: true, value: { uuid: "e-1" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://panel.example.app/api/v1/applications/app-1/envs");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t0ken");
    expect(JSON.parse(init.body as string)).toEqual({ key: "A", value: "b", is_preview: false });
  });

  it("okuma istemcisinde patch yoktur", () => {
    const client = createClient(config, vi.fn() as unknown as typeof fetch);
    expect("patch" in client).toBe(false);
    expect("post" in client).toBe(false);
  });
});
