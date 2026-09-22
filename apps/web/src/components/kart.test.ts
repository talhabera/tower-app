import { describe, expect, it } from "vitest";
import { Kart, type Tazelik } from "./kart";

type KartElement = {
  props: {
    children: [
      {
        props: { children: [unknown, false | null | { props: { children: unknown[] } }] };
      },
      unknown,
    ];
  };
};

function etiketOf(tazelik: Tazelik, zaman?: string | null): string | null {
  const element = Kart({ baslik: "Test", tazelik, zaman, children: null }) as KartElement;
  const [header] = element.props.children;
  const [, span] = header.props.children;
  if (!span) return null;
  return (span.props.children as unknown[]).filter((part) => typeof part === "string").join("");
}

describe("Kart tazelik etiketleri", () => {
  it("taze: hiçbir etiket göstermez", () => {
    expect(etiketOf("taze")).toBeNull();
  });

  it("bayat: 'bayat veri' etiketini gösterir", () => {
    expect(etiketOf("bayat")).toContain("bayat veri");
  });

  it("ulasilamiyor: 'ulaşılamıyor' etiketini gösterir", () => {
    expect(etiketOf("ulasilamiyor")).toContain("ulaşılamıyor");
  });

  it("zaman verildiğinde son okuma zamanını etikete ekler", () => {
    const etiket = etiketOf("bayat", "2026-09-20T10:00:00.000Z");
    expect(etiket).toContain("son okuma");
  });
});
