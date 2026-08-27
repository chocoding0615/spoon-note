import { NextRequest, NextResponse } from "next/server";
import { upsertUserAndCreateSession, verifyOAuthState } from "@/lib/session";
import { fetchNaverProfile } from "@/lib/oauth/naver";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const validState = await verifyOAuthState("naver", state);

  if (!code || !state || !validState) {
    return NextResponse.redirect(new URL("/my?error=login_failed", request.nextUrl.origin));
  }

  try {
    const redirectUri = new URL("/api/auth/naver/callback", request.nextUrl.origin).toString();
    const profile = await fetchNaverProfile(code, redirectUri, state);
    await upsertUserAndCreateSession("naver", profile);
  } catch (error) {
    console.error("[auth] 네이버 로그인 실패:", error);
    return NextResponse.redirect(new URL("/my?error=login_failed", request.nextUrl.origin));
  }

  return NextResponse.redirect(new URL("/my", request.nextUrl.origin));
}
