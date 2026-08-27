import { NextRequest, NextResponse } from "next/server";
import { createOAuthState } from "@/lib/session";
import { buildKakaoAuthorizeUrl } from "@/lib/oauth/kakao";

export async function GET(request: NextRequest) {
  if (!process.env.KAKAO_REST_API_KEY) {
    return NextResponse.json({ error: "카카오 로그인 설정이 아직 준비되지 않았어요." }, { status: 501 });
  }

  const redirectUri = new URL("/api/auth/kakao/callback", request.nextUrl.origin).toString();
  const state = await createOAuthState("kakao");
  return NextResponse.redirect(buildKakaoAuthorizeUrl(redirectUri, state));
}
