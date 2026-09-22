import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/server/base-url";
import { SESSION_COOKIE } from "@/server/session";

/**
 * Giriş yapılmamış istek hiçbir Coolify çağrısı tetiklemez:
 * kontrol sayfadan ÖNCE burada yapılır.
 * Not: burada yalnızca çerezin varlığına bakılır; mühür doğrulaması
 * sayfa tarafındaki requireSession() içinde yapılır (Edge'de kripto maliyeti yüksek).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/api/auth" || pathname.startsWith("/api/auth/") || pathname === "/giris-hatasi";

  if (isPublic) return NextResponse.next();

  if (!request.cookies.get(SESSION_COOKIE)) {
    return NextResponse.redirect(appUrl("/api/auth/login"));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
