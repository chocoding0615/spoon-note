import { NextRequest, NextResponse } from "next/server";
import { createOAuthState } from "@/lib/session";
import { buildNaverAuthorizeUrl } from "@/lib/oauth/naver";

export async function GET(request: NextRequest) {
  if (!process.env.NAVER_CLIENT_ID) {
    return NextResponse.json({ error: "네이버 로그인 설정이 아직 준비되지 않았어요." }, { status: 501 });
  }

  const redirectUri = new URL("/api/auth/naver/callback", request.nextUrl.origin).toString();
  const state = await createOAuthState("naver");
  return NextResponse.redirect(buildNaverAuthorizeUrl(redirectUri, state));
}
