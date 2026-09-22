import { NextResponse } from "next/server";
import { appUrl } from "@/server/oidc";
import { SESSION_COOKIE } from "@/server/session";

/**
 * Çıkış POST'tur (başka bir sitenin GET ile tetiklemesi engellenir) ve herkese
 * açık bir "çıkış yapıldı" sayfasına iner — /api/auth/login'e dönmez; aksi
 * hâlde NexAuth SSO oturumu kullanıcıyı sessizce yeniden içeri alırdı.
 */
export async function POST() {
  const response = NextResponse.redirect(appUrl("/giris-hatasi?durum=cikis"), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
