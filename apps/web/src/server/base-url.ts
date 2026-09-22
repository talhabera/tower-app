/**
 * Uygulamanın dış adresi. Yönlendirmeler ve çerez `secure` bayrağı bundan
 * türetilir — gelen isteğin Host başlığından (request.url) DEĞİL.
 * openid-client içermez: proxy'den güvenle import edilir.
 */
export function baseUrl(): string {
  return (process.env.TOWER_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** `path`'i TOWER_BASE_URL üzerine kurar (ör. "/giris-hatasi?durum=cikis"). */
export function appUrl(path: string): URL {
  return new URL(path, `${baseUrl()}/`);
}
