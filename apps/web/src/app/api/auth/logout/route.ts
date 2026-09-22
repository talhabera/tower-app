import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/session";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/api/auth/login", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
