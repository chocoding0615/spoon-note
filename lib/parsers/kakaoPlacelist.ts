import type { ParsedPlace } from "../types";
import { resolveFinalUrl, fetchWithTimeout } from "./http";
import type { PlacelistResult } from "./placelist";

// 실측 확인(2026-08-27): 카카오맵 "저장 목록(폴더)" 공유 링크(`kko.to/...`)도
// 네이버·구글처럼 캡차 없이 서버 fetch만으로 파싱 가능함이 확인됐다. Playwright로
// 네트워크를 캡처해서 실제 호출되는 내부 API를 찾음:
//
//   GET https://map.kakao.com/favorite/list?folderid={folderId}
//
// 단, 쿠키/로그인은 필요 없지만 **`Referer` 헤더가 폴더 페이지 URL이 아니면
// 403**이 남(실측 확인 - Referer 없이 요청하면 바로 403, 데스크톱 UA로 리다이렉트
// 최종 도착한 폴더 페이지 URL을 Referer로 넣으면 200). 이것도 비공식 내부
// 엔드포인트라 구글/네이버 폴더 파서와 같은 리스크(예고 없이 바뀔 수 있음)가 있다.
//
// 좌표 변환이 하나 더 필요하다: 이 API가 주는 x/y는 WGS84 위경도가 아니라
// 카카오맵 내부 좌표계("WCONGNAMUL")다. 그대로 Leaflet에 찍으면 완전히 엉뚱한
// 위치가 나온다. 다행히 이건 카카오 공식 문서화된 API로 변환 가능하다
// (`dapi.kakao.com/v2/local/geo/transcoord.json`가 `input_coord=WCONGNAMUL`을
// 공식 지원 - 엔드포인트 존재와 인증 요구 형식은 실측 확인함). 그래서
// `KAKAO_REST_API_KEY`가 있을 때만 좌표를 채우고, 없으면 이름/주소만 채운 채
// lat/lng는 비워서 기존 enrich 파이프라인과 동일하게 "있으면 보강, 없으면 생략"
// 원칙을 따른다.
//
// **주의**: 위 좌표 변환은 카카오 공식 API 스펙 기준으로 작성했지만, 지금
// 프로젝트에 `KAKAO_REST_API_KEY`가 설정돼 있지 않아 실제 키로 최종 좌표값까지
// end-to-end 검증은 못 했다(엔드포인트 존재 자체와 인증 실패 응답 형식만 실측
// 확인함). 키가 생기면 실제 값으로 한 번 검증 필요.
//
// 반환 형태가 "URL 하나 → 장소 여러 개"라 기존 PlaceParser 레지스트리와는 안
// 맞는 것도 naverPlacelist.ts/googlePlacelist.ts와 같은 이유로 동일함.

interface KakaoFavorite {
  display1?: string; // 장소명
  display2?: string; // 주소
  key?: string; // 카카오 장소 고유 ID
  x?: number; // WCONGNAMUL 좌표계 - WGS84 아님, 그대로 쓰면 안 됨
  y?: number;
}

interface KakaoFavoriteListResponse {
  favorites?: KakaoFavorite[];
}

function extractFolderId(url: string): string | null {
  try {
    return new URL(url).searchParams.get("folderid");
  } catch {
    return null;
  }
}

async function convertToWgs84(x: number, y: number, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    x: String(x),
    y: String(y),
    input_coord: "WCONGNAMUL",
    output_coord: "WGS84",
  });
  const res = await fetchWithTimeout(`https://dapi.kakao.com/v2/local/geo/transcoord.json?${params}`, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
  });
  if (!res || !res.ok) return null;

  try {
    const data = (await res.json()) as { documents?: { x: number; y: number }[] };
    const point = data.documents?.[0];
    if (!point) return null;
    return { lat: point.y, lng: point.x };
  } catch {
    return null;
  }
}

function toParsedPlace(favorite: KakaoFavorite, folderUrl: string): ParsedPlace | null {
  if (!favorite.display1) return null;

  // key가 있으면 실제 개별 장소 URL을 재구성한다(naverPlacelist.ts와 같은 이유 -
  // 폴더 링크는 모든 장소가 동일값이라 sourceUrl로 중복 판정을 못 하므로, 장소별로
  // 유니크한 URL을 만들어준다. kakao.ts의 canHandle이 `.kakao.com`을 받으므로 호환됨).
  const sourceUrl = favorite.key ? `https://place.map.kakao.com/${favorite.key}` : folderUrl;

  return {
    source: "kakao",
    placeName: favorite.display1,
    address: favorite.display2 || undefined,
    sourceUrl,
  };
}

/** 카카오맵 "저장 목록(폴더)" 공유 링크에서 장소 여러 개를 한 번에 가져온다.
 *  실패(형식 변경/네트워크 오류 등)하면 예외 없이 null을 반환한다. */
export async function parseKakaoPlacelist(url: string): Promise<PlacelistResult | null> {
  const finalUrl = await resolveFinalUrl(url);
  if (!finalUrl) return null;

  const folderId = extractFolderId(finalUrl);
  if (!folderId) return null;

  const res = await fetchWithTimeout(`https://map.kakao.com/favorite/list?folderid=${folderId}`, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; SpoonNoteBot/1.0)",
      referer: finalUrl, // 필수 - 없으면 403 (실측 확인)
    },
  });
  if (!res || !res.ok) return null;

  const data = (await res.json().catch(() => null)) as KakaoFavoriteListResponse | null;
  if (!data?.favorites) return null;

  const apiKey = process.env.KAKAO_REST_API_KEY;

  const places = await Promise.all(
    data.favorites.map(async (favorite) => {
      const place = toParsedPlace(favorite, url);
      if (!place || !apiKey || favorite.x === undefined || favorite.y === undefined) return place;

      const coords = await convertToWgs84(favorite.x, favorite.y, apiKey);
      return coords ? { ...place, lat: coords.lat, lng: coords.lng } : place;
    })
  );

  const nonNullPlaces = places.filter((p): p is ParsedPlace => p !== null);
  if (nonNullPlaces.length === 0) return null;
  // 한 번의 API 호출로 폴더 전체를 받아오는 구조라(실측한 테스트 폴더는 항목이
  // 적어서 페이지네이션 파라미터가 있는지는 확인 못 함) partial은 항상 false.
  return { places: nonNullPlaces, totalCount: nonNullPlaces.length, partial: false };
}
