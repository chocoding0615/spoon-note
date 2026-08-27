import type { PlaceSource, Visibility } from "./types";

export const SOURCE_META: Record<PlaceSource, { label: string; color: string; textColor: string }> = {
  naver: { label: "네이버지도", color: "#03c75a", textColor: "#ffffff" },
  kakao: { label: "카카오맵", color: "#fee500", textColor: "#3c1e1e" },
  google: { label: "구글지도", color: "#4285f4", textColor: "#ffffff" },
  manual: { label: "직접입력", color: "#78716c", textColor: "#ffffff" },
};

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; description: string }[] = [
  { value: "public", label: "전체공개", description: "누구나 열람할 수 있고, 보드 목록에도 노출돼요" },
  { value: "unlisted", label: "일부공개", description: "링크를 아는 사람만 열람할 수 있어요" },
  { value: "private", label: "비공개", description: "나만 열람할 수 있어요" },
];

export const THEMES = ["기본", "여행", "데이트", "혼밥", "회식", "카페투어"] as const;

export const LIMITS = {
  freeBoards: 3,
  freeEntriesPerBoard: 50,
  memoMaxLength: 200,
  titleMaxLength: 40,
  /** 폴더(저장 목록) 링크 한 번 가져오기로 미리보기에 보여줄 최대 개수 */
  importListMax: 100,
} as const;

/** /api/parse 외부 fetch(리다이렉트 추적 등) 타임아웃 */
export const PARSE_FETCH_TIMEOUT_MS = 5000;

/** 커뮤니티 랭킹(같은 장소를 여러 보드가 찜한 것 집계) 설정값 - 하드코딩 금지 원칙에 따라 분리 */
export const COMMUNITY = {
  /** 이 값 이상 보드에 찜되면 "인기 장소"(금색) 표시 대상 */
  goldThreshold: 2,
  /** 근사 매칭(다른 서비스 간, 또는 원본 ID가 없는 소스끼리) 좌표 반경 - 미터 */
  matchRadiusMeters: 50,
  /** 근사 매칭 이름 유사도 최소값(0~1, Levenshtein 기반). 반경 안이어도 이 값
   *  미만이면 다른 장소로 취급(오탐 방지 우선) */
  matchNameSimilarity: 0.6,
} as const;

export const OWNER_KEY_HEADER = "x-owner-key";

export const OWNER_KEY_STORAGE_PREFIX = "spoonnote:ownerKey:";
