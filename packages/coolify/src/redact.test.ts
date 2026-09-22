import { describe, expect, it } from "vitest";
import { redactJson } from "./redact";

describe("redactJson", () => {
  it("gizli anahtarları ve docker alanlarını maskeler, normal alanları korur", () => {
    const input = {
      manual_webhook_secret_github: "abc",
      docker_compose_raw: "POSTGRES_PASSWORD: x",
      name: "ok",
    };
    expect(redactJson(input)).toEqual({
      manual_webhook_secret_github: "***",
      docker_compose_raw: "***",
      name: "ok",
    });
  });

  it("null değerli gizli anahtarı null olarak bırakır", () => {
    expect(redactJson({ token: null })).toEqual({ token: null });
  });

  it("iç içe nesnelerde derinlemesine çalışır", () => {
    const input = { app: { dockerfile_location: "/Dockerfile", nested: { api_key: "xyz" } } };
    expect(redactJson(input)).toEqual({
      app: { dockerfile_location: "***", nested: { api_key: "***" } },
    });
  });

  it("dizilerdeki nesneleri de gezer", () => {
    const input = [{ password: "p1" }, { name: "svc" }];
    expect(redactJson(input)).toEqual([{ password: "***" }, { name: "svc" }]);
  });

  it("şüpheli olmayan anahtarların string yapraklarını maskSecrets ile maskeler", () => {
    const input = { note: "Authorization: Bearer abcdefabcdefabcdef" };
    const out = redactJson(input) as { note: string };
    expect(out.note).toBe("Authorization: Bearer ***");
  });

  it("custom_labels ve custom_docker_run_options anahtarlarını maskeler", () => {
    expect(
      redactJson({
        custom_labels: "traefik.foo=bar",
        custom_docker_run_options: "--privileged",
      }),
    ).toEqual({ custom_labels: "***", custom_docker_run_options: "***" });
  });

  it("girdiyi değiştirmez (saf fonksiyon)", () => {
    const input = { token: "abc", name: "ok" };
    const snapshot = JSON.parse(JSON.stringify(input));
    redactJson(input);
    expect(input).toEqual(snapshot);
  });

  it("S3 cevabındaki çıplak `key` ve `secret` alanlarını maskeler", () => {
    const input = [{ uuid: "u1", name: "nexstep-tower", key: "mykey123", secret: "mysecret" }];
    expect(redactJson(input)).toEqual([{ uuid: "u1", name: "nexstep-tower", key: "***", secret: "***" }]);
  });

  it("`key` içeren ama `key` olmayan anahtarları maskelemez", () => {
    expect(redactJson({ monkey: "x", keys_count: 3 })).toEqual({ monkey: "x", keys_count: 3 });
  });
});
