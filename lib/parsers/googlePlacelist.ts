import type { ParsedPlace } from "../types";
import { resolveFinalUrl, fetchHtml, fetchWithTimeout, isSafeUrl } from "./http";
import type { PlacelistResult } from "./placelist";

// 실측 확인(2026-08-27): 구글맵 "저장 목록(폴더)" 공유 링크(`maps.app.goo.gl/...`)는
// 개별 장소 링크와 달리 서버 fetch로 캡차/차단 없이 통과한다. 최종 페이지
// (`google.com/maps/placelists/list/{id}` 또는 UA에 따라 한 홉 더 거쳐
// `google.com/maps/@/data=...!11m1!2s{id}`)의 <head>에 브라우저가 클라이언트에서
// 호출할 내부 API 링크가 <link rel="preload" as="fetch">로 미리 박혀있는데, 이
// 엔드포인트(`/maps/preview/entitylist/getlist?...pb=...`)를 직접 호출하면 로그인/
// 쿠키 없이도 목록의 장소들을 JSON으로 그대로 받을 수 있다.
//
// 다만 이건 공식 API가 아니라 구글 내부 렌더링 파이프라인이 쓰는 비공개
// 엔드포인트라(문서화 안 됨, 필드에 이름 없이 위치로만 구분되는 응답 구조),
// 구글이 예고 없이 형식을 바꾸면 조용히 깨질 수 있다. 그래서 배열 형태가 예상과
// 다르면 예외를 던지는 대신 그 항목만 건너뛴다.
//
// PlaceParser 인터페이스(단일 URL → 단일 ParsedPlace)와는 반환 형태 자체가
// 달라서(목록 → 여러 ParsedPlace) 기존 파서 레지스트리엔 안 끼워 넣었다 - "링크
// 하나 붙여넣기 = 장소 하나 추가"와 "폴더 링크 하나 = 장소 여러 개 한번에
// 가져오기"는 애초에 다른 사용자 액션이라 상위 API 라우트도 따로 둬야 함.

function extractEntityListPath(html: string): string | null {
  const match = html.match(/href="(\/maps\/preview\/entitylist\/getlist\?[^"]+)"/);
  if (!match) return null;
  return match[1].replace(/&amp;/g, "&");
}

// 응답의 각 장소 항목은 필드에 이름이 없는 중첩 배열이다(실측 구조, 위 주석 참고):
//   place[1][5] = [null, null, lat, lng]
//   place[2]    = 장소명
//   place[3]    = 주소(비어있는 경우가 많음 - 이 엔드포인트가 항상 채워주진 않음)
// 장소 사진 URL은 이 응답에 없다(목록 소유자의 프로필 사진만 있음 - 장소 사진 아님).
function parsePlaceEntry(entry: unknown): ParsedPlace | null {
  if (!Array.isArray(entry)) return null;
  const placeName = entry[2];
  if (typeof placeName !== "string" || !placeName) return null;

  const location = entry[1];
  const coords = Array.isArray(location) ? location[5] : undefined;
  const lat = Array.isArray(coords) ? coords[2] : undefined;
  const lng = Array.isArray(coords) ? coords[3] : undefined;

  const address = typeof entry[3] === "string" && entry[3] ? entry[3] : undefined;

  return {
    source: "google",
    placeName,
    address,
    lat: typeof lat === "number" ? lat : undefined,
    lng: typeof lng === "number" ? lng : undefined,
    sourceUrl: "", // 개별 장소 URL이 아니라 폴더 링크에서 왔으므로 호출부에서 원본 폴더 링크로 채운다
  };
}

/** 구글맵 "저장 목록(폴더)" 공유 링크에서 장소 여러 개를 한 번에 가져온다.
 *  실패(캡차/형식 변경/네트워크 오류 등)하면 예외 없이 null을 반환한다. */
export async function parseGooglePlacelist(url: string): Promise<PlacelistResult | null> {
  const finalUrl = await resolveFinalUrl(url);
  if (!finalUrl) return null;

  const html = await fetchHtml(finalUrl);
  if (!html) return null;

  const entityListPath = extractEntityListPath(html);
  if (!entityListPath) return null;

  const apiUrl = new URL(entityListPath, "https://www.google.com").toString();
  if (!isSafeUrl(apiUrl)) return null;

  const res = await fetchWithTimeout(apiUrl, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; SpoonNoteBot/1.0)" },
  });
  if (!res || !res.ok) return null;

  const raw = await res.text();
  const jsonText = raw.replace(/^\)\]\}'\s*/, ""); // 구글 특유의 JSON 하이재킹 방지 접두어 제거

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
  const entries = data[0][8]; // 실측 구조상 8번 인덱스가 장소 배열
  if (!Array.isArray(entries)) return null;

  const places = entries
    .map(parsePlaceEntry)
    .filter((p): p is ParsedPlace => p !== null)
    .map((p) => ({ ...p, sourceUrl: url }));

  if (places.length === 0) return null;
  // 한 번의 API 호출로 전부 받아오는 구조라(§주석 참고, pb 파라미터에 최대 500개
  // 상한이 이미 걸려있음) 페이지네이션 중 실패가 없다 - partial은 항상 false.
  return { places, totalCount: places.length, partial: false };
}
