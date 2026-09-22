import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Sayac } from "./sayac";

const render = (sayi: number | null) =>
  renderToStaticMarkup(<Sayac baslik="Yedeksiz veritabanı" sayi={sayi} href="/yedekleme" aciklama="x" />);

describe("Sayac", () => {
  it("kaynak okunamadıysa 0 değil '?' ve 'ulaşılamıyor' gösterir", () => {
    const html = render(null);
    expect(html).toContain(">?<");
    expect(html).toContain("ulaşılamıyor");
    expect(html).not.toContain(">0<");
  });

  it("sayı biliniyorsa sayıyı gösterir, 'ulaşılamıyor' göstermez", () => {
    const html = render(0);
    expect(html).toContain(">0<");
    expect(html).not.toContain("ulaşılamıyor");
  });
});
