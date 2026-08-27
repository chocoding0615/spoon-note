import type { OAuthProfile } from "../session";

export function buildKakaoAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.KAKAO_REST_API_KEY ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    // "생년"(birthyear) 동의항목은 카카오 개발자 콘솔 "카카오 로그인 > 동의항목"에서
    // 켜야 하는데, 실측 확인(2026-08-27) 결과 활성화 안 된 상태에서 스코프에
    // 넣으면 조용히 빠지는 게 아니라 인가 요청 자체가 KOE205(허용되지 않은
    // scope) 에러로 거부된다 - 예전 주석은 틀렸다. 게다가 "생년" 동의항목은
    // 최근 정책상 사업자 등록이 있어야 콘솔에서 활성화 자체가 가능해서, 사업자
    // 등록 전까진 요청할 방법이 없다. 그래서 일단 빼고, birthYear는 항상
    // null로 내려간다(§fetchKakaoProfile) - 기존 "연령 미상 = 안전 우선 차단"
    // 로직이 그대로 적용돼 커뮤니티공개만 못 쓰고 나머지 기능은 정상 동작한다.
    // 사업자 등록 후 "생년" 동의항목을 켜면 이 scope를 다시 추가하면 된다.
    scope: "profile_nickname profile_image",
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
