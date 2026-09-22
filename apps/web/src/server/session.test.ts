import { describe, expect, it } from "vitest";
import { sealSession, unsealSession, type TowerSession } from "./session";

const SECRET = "0123456789abcdef0123456789abcdef";

const session: TowerSession = {
  sub: "user-1",
  email: "owner@example.org",
  name: "Talha",
  expiresAt: Date.now() + 3_600_000,
};

describe("oturum çerezi", () => {
  it("mühürleyip geri açar", async () => {
    const token = await sealSession(session, SECRET);
    const back = await unsealSession(token, SECRET);
    expect(back?.sub).toBe("user-1");
    expect(back?.email).toBe("owner@example.org");
  });

  it("mühürlü metin düz veri sızdırmaz", async () => {
    const token = await sealSession(session, SECRET);
    expect(token).not.toContain("example.org");
    expect(token).not.toContain("user-1");
  });

  it("yanlış gizli anahtarla açılmaz", async () => {
    const token = await sealSession(session, SECRET);
    expect(await unsealSession(token, "ffffffffffffffffffffffffffffffff")).toBeNull();
  });

  it("bozuk token'da null döner", async () => {
    expect(await unsealSession("çöp", SECRET)).toBeNull();
  });

  it("süresi geçmiş oturumu reddeder", async () => {
    const expired = { ...session, expiresAt: Date.now() - 1000 };
    const token = await sealSession(expired, SECRET);
    expect(await unsealSession(token, SECRET)).toBeNull();
  });
});
