import type { ParsedPlace } from "../types";
import { fetchWithTimeout, isSafeUrl } from "./http";
import type { PlacelistResult } from "./placelist";

// 실측 확인(2026-08-27): 네이버지도 "저장 목록(폴더)" 공유 링크(`naver.me/...`)는
// 개별 장소 링크(m.place.naver.com)와 달리 캡차가 전혀 안 걸리고, 헤드리스
// 브라우저도 필요 없다 - 순수 서버 fetch만으로 끝까지 된다.
//
// 흐름: `naver.me/{code}`를 리다이렉트 1홉만 따라가면(`redirect:"manual"`)
// `location` 헤더가 항상 `https://map.naver.com/v5/favorite/myPlace/folder/{shareId}`
// 형태라 여기서 shareId를 바로 뽑을 수 있다(desktop/mobile UA 둘 다 이 첫 홉은
// 동일했음 - UA 분기는 그 이후 단계에서만 발생해서 신경 쓸 필요 없음).
// 이 shareId로 `pages.map.naver.com/save-pages/api/maps-bookmark/v3/shares/{shareId}/bookmarks`
// JSON API를 직접 호출하면 로그인/쿠키/특정 UA 없이 바로 장소 목록을 내려준다
// (실측: curl 기본 UA, 프로젝트 봇 UA, Node fetch 전부 동일하게 통과함).
//
// 주의: `placeInfo=true`(사진 포함해서 받기)일 땐 `limit`이 20을 넘으면
// `apiErrorCode:1002`로 400이 난다(실측 확인) - 그래서 20개씩 나눠 받는다.
// 이것도 공식 문서가 있는 API는 아니라서, 구글 폴더 파서(`googlePlacelist.ts`)와
// 마찬가지로 형식이 예고 없이 바뀔 수 있다는 리스크는 동일하게 있다.
// 반환 형태가 "URL 하나 → 장소 여러 개"라 기존 PlaceParser 레지스트리와도
// 안 맞는 것 역시 googlePlacelist.ts와 같은 이유로 동일함.

const PAGE_SIZE = 20; // placeInfo=true일 때 서버가 허용하는 최대치(실측 확인)
const MAX_PAGES = 10; // 장당 20개 * 10 = 200개까지 방어적으로 상한(무한루프 방지)

interface NaverBookmark {
  name?: string;
  displayName?: string;
  px?: number; // 경도
  py?: number; // 위도
  address?: string;
  sid?: string; // 네이버 장소 고유 ID
  mcidName?: string; // 카테고리명
  placeInfo?: { thumbnailUrls?: string[] };
}

interface NaverBookmarksResponse {
  folder?: { bookmarkCount?: number };
  bookmarkList?: NaverBookmark[];
}

function extractShareId(locationHeader: string): string | null {
  return locationHeader.match(/\/folder\/([^/?#]+)/)?.[1] ?? null;
}

function toParsedPlace(bookmark: NaverBookmark, folderUrl: string): ParsedPlace | null {
  const placeName = bookmark.name || bookmark.displayName;
  if (!placeName) return null;

  // sid가 있으면 실제 개별 장소 URL을 재구성한다(기존 단일 링크 파서가 다루는
  // 것과 동일한 형태 - naver.ts의 canHandle이 `.naver.com`을 받으므로 호환됨).
  // 이렇게 하면 sourceUrl이 폴더 링크(모든 장소가 동일값이라 식별자로 못 씀) 대신
  // 장소별로 유니크해져서, 보드에 이미 담긴 장소인지 sourceUrl로 비교 가능해진다.
  const sourceUrl = bookmark.sid ? `https://m.place.naver.com/place/${bookmark.sid}` : folderUrl;

  return {
    source: "naver",
    placeName,
    address: bookmark.address || undefined,
    lat: typeof bookmark.py === "number" ? bookmark.py : undefined,
    lng: typeof bookmark.px === "number" ? bookmark.px : undefined,
    category: bookmark.mcidName || undefined,
    photos: bookmark.placeInfo?.thumbnailUrls,
    sourceUrl,
  };
}

/** 네이버지도 "저장 목록(폴더)" 공유 링크에서 장소 여러 개를 한 번에 가져온다.
 *  실패(형식 변경/네트워크 오류 등)하면 예외 없이 null을 반환한다. */
export async function parseNaverPlacelist(url: string): Promise<PlacelistResult | null> {
  if (!isSafeUrl(url)) return null;

  const redirectRes = await fetchWithTimeout(url, {
    redirect: "manual",
    headers: { "user-agent": "Mozilla/5.0 (compatible; SpoonNoteBot/1.0)" },
  });
  if (!redirectRes || redirectRes.status < 300 || redirectRes.status >= 400) return null;

  const location = redirectRes.headers.get("location");
  const shareId = location ? extractShareId(location) : null;
  if (!shareId) return null;

  const places: ParsedPlace[] = [];
  let bookmarkCount = Infinity;
  let partial = false;

  for (let page = 0; page < MAX_PAGES && page * PAGE_SIZE < bookmarkCount; page++) {
    const apiUrl =
      `https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/shares/${shareId}/bookmarks` +
      `?placeInfo=true&start=${page * PAGE_SIZE}&limit=${PAGE_SIZE}&sort=lastUseTime&mcids=ALL&createIdNo=true`;

    const res = await fetchWithTimeout(apiUrl, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; SpoonNoteBot/1.0)" },
    });
    if (!res || !res.ok) {
      partial = page > 0; // 첫 페이지부터 실패면 완전 실패, 이후 페이지 실패면 부분 성공
      break;
    }

    const data = (await res.json().catch(() => null)) as NaverBookmarksResponse | null;
    if (!data?.bookmarkList) {
      partial = page > 0;
      break;
    }

    bookmarkCount = data.folder?.bookmarkCount ?? data.bookmarkList.length;
    for (const bookmark of data.bookmarkList) {
      const place = toParsedPlace(bookmark, url);
      if (place) places.push(place);
    }

    if (data.bookmarkList.length < PAGE_SIZE) break; // 마지막 페이지
  }

  if (places.length === 0) return null;
  return { places, totalCount: Number.isFinite(bookmarkCount) ? bookmarkCount : places.length, partial };
}
