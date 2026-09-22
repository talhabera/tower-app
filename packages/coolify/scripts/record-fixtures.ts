/**
 * Canlı Coolify instance'ından fixture kaydeder.
 * Yazmadan önce TÜM gövde redactJson'dan geçer: önce şüpheli anahtarlar
 * bütünüyle "***" ile değiştirilir, sonra kalan string yapraklar
 * maskSecrets ile maskelenir — ham cevap repoya girmez.
 * Kullanım (repo kökünden): pnpm --filter @tower/coolify record:fixtures
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "../src/http";
import { readConfig } from "../src/config";
import { maskSecrets } from "../src/mask";
import { redactJson } from "../src/redact";

const OUT_DIR = path.join(import.meta.dirname, "..", "src", "fixtures");

async function save(client: ReturnType<typeof createClient>, name: string, apiPath: string) {
  const result = await client.get<unknown>(apiPath);
  if (!result.ok) {
    console.error(`atlandı ${name}: ${result.error.kind} — ${result.error.message}`);
    return null;
  }
  const masked = redactJson(result.value);
  writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(masked, null, 2));
  console.log(`yazıldı ${name}.json`);
  // Gezinme (sonraki uçların uuid/ad'ları) ham değerle yapılır: maskeleme 20+
  // karakterlik kimlikleri de "***" yapar. Ham değer yalnızca bellekte kalır.
  return result.value;
}

async function main() {
  const config = readConfig(process.env);
  if (!config.ok) {
    console.error(config.error.message);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const client = createClient(config.value);

  await save(client, "servers", "/servers");
  await save(client, "databases", "/databases");
  await save(client, "s3-storages", "/s3-storages");
  await save(client, "deployments", "/deployments");

  const projects = (await save(client, "projects", "/projects")) as
    | Array<{ uuid: string; name: string }>
    | null;
  if (!projects?.length) return;

  const first = projects[0];
  const envs = (await save(
    client,
    `environments-${first.uuid}`,
    `/projects/${encodeURIComponent(first.uuid)}/environments`,
  )) as Array<{ name: string }> | null;

  if (envs?.length) {
    const detail = (await save(
      client,
      "environment-detail",
      `/projects/${encodeURIComponent(first.uuid)}/${encodeURIComponent(envs[0].name)}`,
    )) as { applications?: Array<{ uuid: string }> } | null;

    const app = detail?.applications?.[0];
    if (app) await save(client, "application-detail", `/applications/${encodeURIComponent(app.uuid)}`);
  }
}

main().catch((e: unknown) => {
  // Hata nesnesi istek bağlamı (token) taşıyabilir: yalnızca maskelenmiş mesaj basılır.
  console.error(`kayıt başarısız: ${maskSecrets(e instanceof Error ? e.message : String(e))}`);
  process.exit(1);
});
