import { NextRequest, NextResponse } from "next/server";
import { upsertUserAndCreateSession, verifyOAuthState } from "@/lib/session";
import { fetchKakaoProfile } from "@/lib/oauth/kakao";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const validState = await verifyOAuthState("kakao", state);

  if (!code || !validState) {
    return NextResponse.redirect(new URL("/my?error=login_failed", request.nextUrl.origin));
  }

  try {
    const redirectUri = new URL("/api/auth/kakao/callback", request.nextUrl.origin).toString();
    const profile = await fetchKakaoProfile(code, redirectUri);
    await upsertUserAndCreateSession("kakao", profile);
  } catch (error) {
    console.error("[auth] 카카오 로그인 실패:", error);
    return NextResponse.redirect(new URL("/my?error=login_failed", request.nextUrl.origin));
  }

  return NextResponse.redirect(new URL("/my", request.nextUrl.origin));
}
