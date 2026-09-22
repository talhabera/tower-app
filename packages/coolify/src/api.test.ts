import { describe, expect, it } from "vitest";
import environmentDetail from "./fixtures/environment-detail.json";
import servers from "./fixtures/servers.json";
import databases from "./fixtures/databases.json";
import projects from "./fixtures/projects.json";
import applicationDetail from "./fixtures/application-detail.json";
import {
  getEnvironment,
  listServers,
  listProjects,
  listEnvironments,
  listDatabases,
  getDatabaseBackups,
  listS3Storages,
  getApplication,
  listDeployments,
  listApplicationEnvKeys,
  listApplicationStorages,
  listApplicationScheduledTasks,
  listApplicationDeployments,
  getApplicationLogs,
} from "./api";
import type { CoolifyHttp } from "./http";
import { ok } from "./result";

function stubHttp(payload: unknown): CoolifyHttp {
  return { get: async <T>() => ok(payload as T) };
}

describe("listServers", () => {
  it("sunucuları erişilebilirlik bayraklarıyla eşler", async () => {
    const r = await listServers(stubHttp(servers));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBeGreaterThan(0);
    const s = r.value[0];
    expect(typeof s.uuid).toBe("string");
    expect(typeof s.name).toBe("string");
    expect(typeof s.reachable).toBe("boolean");
    expect(typeof s.usable).toBe("boolean");
  });

  it("kötü biçimlendirilmiş yanıtlardaki null ve skalerleri atlar", async () => {
    const r = await listServers(stubHttp([null, 42, { uuid: "s1", name: "valid", settings: {} }]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
    expect(r.value[0].uuid).toBe("s1");
  });
});

describe("getEnvironment", () => {
  it("tüm tür kovalarını tek kaynak listesine düzleştirir", async () => {
    const r = await getEnvironment(stubHttp(environmentDetail), "proj-uuid", "production");
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const kinds = new Set(r.value.resources.map((x) => x.kind));
    expect(kinds.has("application")).toBe(true);
    for (const res of r.value.resources) {
      expect(res.projectUuid).toBe("proj-uuid");
      expect(res.environmentName).toBe(r.value.name);
      expect(res.status.state).toBeDefined();
    }
  });

  it("boş kovalar için kaynak üretmez", async () => {
    const r = await getEnvironment(
      stubHttp({ uuid: "e1", name: "production", applications: [], postgresqls: [], mysqls: [] }),
      "p",
      "production",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.resources).toEqual([]);
  });

  it("bilinmeyen kovaları yok sayar", async () => {
    const r = await getEnvironment(
      stubHttp({ uuid: "e1", name: "production", applications: [], gelecektekiTur: [{ uuid: "x" }] }),
      "p",
      "production",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.resources).toEqual([]);
  });
});

describe("listProjects", () => {
  it("projeler uuid ve ad alanlarını eşler", async () => {
    const r = await listProjects(stubHttp(projects));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBeGreaterThan(0);
    expect(typeof r.value[0].uuid).toBe("string");
    expect(typeof r.value[0].name).toBe("string");
  });
});

describe("listEnvironments", () => {
  it("ortamlar uuid ve ad alanlarını eşler", async () => {
    const r = await listEnvironments(
      stubHttp([{ uuid: "env-1", name: "production" }]),
      "proj-uuid",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
    expect(r.value[0].uuid).toBe("env-1");
    expect(r.value[0].name).toBe("production");
  });
});

describe("listDatabases", () => {
  it("veritabanlarını uuid, ad ve durum ile eşler", async () => {
    const r = await listDatabases(stubHttp(databases));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBeGreaterThan(0);
    const db = r.value[0];
    expect(typeof db.uuid).toBe("string");
    expect(typeof db.name).toBe("string");
    expect(typeof db.status.state).toBe("string");
    expect(db.backups).toEqual([]);
  });
});

describe("getDatabaseBackups", () => {
  it("yedekleri uuid, enabled, frequency ve saveToS3 ile eşler", async () => {
    const r = await getDatabaseBackups(
      stubHttp([
        { uuid: "b1", enabled: true, frequency: "daily", save_s3: false },
      ]),
      "db-uuid",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
    expect(r.value[0].uuid).toBe("b1");
    expect(r.value[0].enabled).toBe(true);
    expect(r.value[0].frequency).toBe("daily");
    expect(r.value[0].saveToS3).toBe(false);
  });
});

describe("listS3Storages", () => {
  it("S3 depolamalarını uuid, ad, bucket, endpoint ve usable ile eşler", async () => {
    const r = await listS3Storages(
      stubHttp([
        {
          uuid: "s3-1",
          name: "backup-storage",
          bucket: "my-bucket",
          endpoint: "s3.example.com",
          is_usable: true,
        },
      ]),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
    expect(r.value[0].uuid).toBe("s3-1");
    expect(r.value[0].bucket).toBe("my-bucket");
    expect(r.value[0].usable).toBe(true);
  });
});

describe("getApplication", () => {
  it("uygulamayı tüm alanlarıyla eşler ve fqdn'i etki alanları listesine böler", async () => {
    const r = await getApplication(stubHttp(applicationDetail), "app-uuid");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.value.uuid).toBe("string");
    expect(typeof r.value.name).toBe("string");
    expect(Array.isArray(r.value.domains)).toBe(true);
    expect(r.value.domains.length).toBeGreaterThan(0);
    expect(typeof r.value.status.state).toBe("string");
  });
});

describe("listDeployments", () => {
  it("dağıtımları uuid, applicationName, status ve createdAt ile eşler", async () => {
    const r = await listDeployments(
      stubHttp([
        {
          deployment_uuid: "deploy-1",
          uuid: "d1",
          application_name: "nexauth",
          status: "running",
          created_at: "2026-09-22T10:00:00Z",
        },
      ]),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
    expect(r.value[0].uuid).toBe("deploy-1");
    expect(r.value[0].applicationName).toBe("nexauth");
    expect(r.value[0].status).toBe("running");
  });
});

describe("listApplicationEnvKeys", () => {
  it("yalnızca key, isBuildTime ve isPreview alanlarını döner — value asla paket sınırını geçmez", async () => {
    const r = await listApplicationEnvKeys(
      stubHttp([
        {
          uuid: "env-1",
          key: "DATABASE_URL",
          value: "supersecret",
          is_build_time: true,
          is_preview: false,
        },
      ]),
      "app-uuid",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
    expect(r.value[0].key).toBe("DATABASE_URL");
    expect(r.value[0].isBuildTime).toBe(true);
    expect(r.value[0].isPreview).toBe(false);
    expect(JSON.stringify(r.value)).not.toContain("supersecret");
  });

  it("kötü biçimlendirilmiş öğeleri atlar", async () => {
    const r = await listApplicationEnvKeys(stubHttp([null, 42, { key: "OK" }]), "app-uuid");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
    expect(r.value[0].key).toBe("OK");
  });
});

describe("listApplicationStorages", () => {
  it("kalıcı depoları uuid, ad ve mountPath ile eşler", async () => {
    const r = await listApplicationStorages(
      stubHttp([{ uuid: "st-1", name: "veri", mount_path: "/data" }]),
      "app-uuid",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
    expect(r.value[0].uuid).toBe("st-1");
    expect(r.value[0].name).toBe("veri");
    expect(r.value[0].mountPath).toBe("/data");
  });
});

describe("listApplicationScheduledTasks", () => {
  it("zamanlanmış görevleri uuid, ad, frequency ve enabled ile eşler", async () => {
    const r = await listApplicationScheduledTasks(
      stubHttp([{ uuid: "task-1", name: "temizlik", frequency: "0 0 * * *", enabled: true }]),
      "app-uuid",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
    expect(r.value[0].uuid).toBe("task-1");
    expect(r.value[0].frequency).toBe("0 0 * * *");
    expect(r.value[0].enabled).toBe(true);
  });
});

describe("listApplicationDeployments", () => {
  it("uygulamaya özel son dağıtımları eşler ve limitli döner", async () => {
    const r = await listApplicationDeployments(
      stubHttp({
        data: [
          {
            deployment_uuid: "deploy-1",
            application_name: "nexauth",
            status: "finished",
            created_at: "2026-09-22T10:00:00Z",
          },
        ],
      }),
      "app-uuid",
      10,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
    expect(r.value[0].uuid).toBe("deploy-1");
    expect(r.value[0].status).toBe("finished");
  });

  it("düz dizi yanıtını da kabul eder", async () => {
    const r = await listApplicationDeployments(
      stubHttp([{ deployment_uuid: "d1", status: "running", created_at: "t" }]),
      "app-uuid",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
  });
});

describe("getApplicationLogs", () => {
  it("log satırlarındaki gizli bilgileri maskeler", async () => {
    const r = await getApplicationLogs(
      stubHttp({ logs: "başlatılıyor\npassword=hunter2\nhazır" }),
      "app-uuid",
      100,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain("password=***");
    expect(r.value.join("\n")).not.toContain("hunter2");
  });

  it("dizi biçimindeki log yanıtını da kabul eder", async () => {
    const r = await getApplicationLogs(stubHttp(["satır 1", "satır 2"]), "app-uuid");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(2);
  });
});
