import { describe, expect, it } from "vitest";
import { DEFAULT_PRESET } from "@tower/db";
import { parsePresetForm, presetTarget } from "./preset";

const usable = { uuid: "s3-1", name: "nexstep-tower", bucket: "b", endpoint: "e", usable: true };
const broken = { ...usable, uuid: "s3-2", usable: false };

function form(v: Record<string, string>) {
  const f = new FormData();
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
}

describe("presetTarget", () => {
  it("hedef S3 yoksa needs_s3", () => {
    expect(presetTarget(DEFAULT_PRESET, [usable])).toMatchObject({ ok: false, error: { kind: "needs_s3" } });
  });
  it("hedef S3 artık kullanılamıyorsa needs_s3", () => {
    expect(presetTarget({ ...DEFAULT_PRESET, s3StorageUuid: "s3-2" }, [broken])).toMatchObject({
      ok: false,
      error: { kind: "needs_s3" },
    });
  });
  it("kullanılabilir hedefte Coolify girdisini üretir", () => {
    expect(presetTarget({ ...DEFAULT_PRESET, s3StorageUuid: "s3-1" }, [usable])).toEqual({
      ok: true,
      value: { frequency: "0 3 * * *", s3StorageUuid: "s3-1", keepLocal: 7, keepS3: 30 },
    });
  });
});

describe("parsePresetForm", () => {
  const good = { frequency: "0 3 * * *", keepLocal: "7", keepS3: "30", s3StorageUuid: "s3-1" };
  it("geçerli formu ayrıştırır", () => {
    expect(parsePresetForm(form(good), ["s3-1"])).toEqual({
      ok: true,
      value: { frequency: "0 3 * * *", keepLocal: 7, keepS3: 30, s3StorageUuid: "s3-1" },
    });
  });
  it("Coolify anahtar kelimelerini kabul eder", () => {
    expect(parsePresetForm(form({ ...good, frequency: "daily" }), ["s3-1"]).ok).toBe(true);
  });
  it("5 alanlı olmayan cron'u reddeder", () => {
    expect(parsePresetForm(form({ ...good, frequency: "0 3 * *" }), ["s3-1"]).ok).toBe(false);
  });
  it("1-365 dışı saklama sayısını reddeder", () => {
    expect(parsePresetForm(form({ ...good, keepLocal: "0" }), ["s3-1"]).ok).toBe(false);
    expect(parsePresetForm(form({ ...good, keepS3: "366" }), ["s3-1"]).ok).toBe(false);
    expect(parsePresetForm(form({ ...good, keepS3: "3.5" }), ["s3-1"]).ok).toBe(false);
  });
  it("kullanılabilir listede olmayan S3'ü reddeder", () => {
    expect(parsePresetForm(form(good), ["s3-9"]).ok).toBe(false);
  });
});
