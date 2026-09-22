import { describe, expect, it } from "vitest";
import Link from "next/link";
import { parseStatus, type FleetResource, type ResourceKind } from "@tower/coolify";
import { KaynakSatiri } from "./kaynak-satiri";

function kaynak(kind: ResourceKind): FleetResource {
  return {
    uuid: "r1",
    name: "test-kaynak",
    kind,
    status: parseStatus("running:healthy"),
    projectUuid: "p1",
    projectName: "proje",
    environmentName: "production",
  };
}

type SatirElement = {
  props: { children: [{ type: unknown; props?: { href?: string } }, unknown, unknown] };
};

describe("KaynakSatiri", () => {
  it("uygulama satırları /filo/[uuid] adresine bağlanır", () => {
    const element = KaynakSatiri({ kaynak: kaynak("application") }) as SatirElement;
    const [ilk] = element.props.children;
    expect(ilk.type).toBe(Link);
    expect(ilk.props?.href).toBe("/filo/r1");
  });

  it("veritabanı satırları bağlantı içermez", () => {
    const element = KaynakSatiri({ kaynak: kaynak("postgresql") }) as SatirElement;
    const [ilk] = element.props.children;
    expect(ilk.type).not.toBe(Link);
    expect(ilk.type).toBe("span");
  });

  it("servis satırları bağlantı içermez", () => {
    const element = KaynakSatiri({ kaynak: kaynak("service") }) as SatirElement;
    const [ilk] = element.props.children;
    expect(ilk.type).not.toBe(Link);
    expect(ilk.type).toBe("span");
  });
});
