import { describe, expect, it } from "vitest";
import { parseStatus, type ResourceStatus } from "@tower/coolify";
import { DurumRozeti } from "./durum-rozeti";

function classNameOf(status: ResourceStatus): string {
  const element = DurumRozeti({ status }) as { props: { className: string } };
  return element.props.className;
}

describe("DurumRozeti", () => {
  it("running:healthy yeşil renge eşlenir", () => {
    expect(classNameOf(parseStatus("running:healthy"))).toContain("emerald");
  });

  it("running:unknown asla yeşil değildir (gri/nötr)", () => {
    const className = classNameOf(parseStatus("running:unknown"));
    expect(className).not.toContain("emerald");
    expect(className).not.toContain("green");
    expect(className).toContain("amber");
  });

  it("running:unhealthy kırmızıya eşlenir", () => {
    expect(classNameOf(parseStatus("running:unhealthy"))).toContain("red");
  });

  it("exited:unknown kırmızıya eşlenir", () => {
    expect(classNameOf(parseStatus("exited:unknown"))).toContain("red");
  });

  it("exited:unhealthy kırmızıya eşlenir", () => {
    expect(classNameOf(parseStatus("exited:unhealthy"))).toContain("red");
  });
});
