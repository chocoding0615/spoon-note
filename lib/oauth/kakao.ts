import type { OAuthProfile } from "../session";

export function buildKakaoAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.KAKAO_REST_API_KEY ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    // "생년"(birthyear) 동의항목은 카카오 개발자 콘솔 "카카오 로그인 > 동의항목"에서
    // 별도로 켜야 실제 값이 온다(§설계안 06) - 안 켜져 있으면 이 스코프는 그냥
    // 동의 화면에 안 뜨고 응답에도 빠질 뿐, 로그인 자체가 깨지진 않는다.
    scope: "profile_nickname profile_image birthyear",
  });
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}

export async function fetchKakaoProfile(code: string, redirectUri: string): Promise<OAuthProfile> {
  const tokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.KAKAO_REST_API_KEY ?? "",
    client_secret: process.env.KAKAO_CLIENT_SECRET ?? "",
    redirect_uri: redirectUri,
    code,
  });

  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });
  if (!tokenRes.ok) throw new Error(`kakao token exchange failed: ${tokenRes.status}`);
  const tokenJson = (await tokenRes.json()) as { access_token: string };

  const profileRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!profileRes.ok) throw new Error(`kakao profile fetch failed: ${profileRes.status}`);
  const profileJson = (await profileRes.json()) as {
    id: number;
    kakao_account?: {
      profile?: { nickname?: string; profile_image_url?: string };
      // "1998" 형태(4자리 연도 문자열) - 동의 안 했거나 콘솔에서 항목이 꺼져있으면
      // 필드 자체가 없다.
      birthyear?: string;
    };
  };

  const birthyear = profileJson.kakao_account?.birthyear;

  return {
    providerId: String(profileJson.id),
    nickname: profileJson.kakao_account?.profile?.nickname ?? "스푼노트 사용자",
    profileImageUrl: profileJson.kakao_account?.profile?.profile_image_url ?? null,
    birthYear: birthyear ? Number(birthyear) : null,
  };
}
