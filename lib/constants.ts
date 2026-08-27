import type { FeedSort, PlaceSource, Visibility } from "./types";

export const SOURCE_META: Record<PlaceSource, { label: string; color: string; textColor: string }> = {
  naver: { label: "네이버지도", color: "#03c75a", textColor: "#ffffff" },
  kakao: { label: "카카오맵", color: "#fee500", textColor: "#3c1e1e" },
  google: { label: "구글지도", color: "#4285f4", textColor: "#ffffff" },
  manual: { label: "직접입력", color: "#78716c", textColor: "#ffffff" },
};

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; description: string }[] = [
  { value: "private", label: "비공개", description: "나만 열람할 수 있어요" },
  { value: "unlisted", label: "링크공유", description: "링크를 아는 사람만 열람할 수 있어요" },
  { value: "community", label: "커뮤니티공개", description: "누구나 열람할 수 있고, 커뮤니티에도 노출돼요" },
];

/** VISIBILITY_OPTIONS에서 값만 뽑은 배열 - API 라우트가 요청값 검증에 쓴다.
 *  예전엔 라우트마다 이 목록을 따로 하드코딩해서 VISIBILITY_OPTIONS와 따로
 *  놀 위험이 있었다(코드리뷰 지적 사항). */
export const VISIBILITY_VALUES: Visibility[] = VISIBILITY_OPTIONS.map((option) => option.value);

/** 커뮤니티공개 보드에 닉네임을 안 정했을 때 보여줄 기본 표시명 */
export const DEFAULT_NICKNAME = "익명의 미식가";

export const NICKNAME_STORAGE_KEY = "spoonnote:nickname";

/** 홈 탭 "마지막으로 본 지역" 기억용(§프롬프트 10 RegionPicker) */
export const LAST_REGION_STORAGE_KEY = "spoonnote:lastRegion";

export const THEMES = ["기본", "여행", "데이트", "혼밥", "회식", "카페투어"] as const;

export const LIMITS = {
  freeBoards: 10,
  freeEntriesPerBoard: 50,
  memoMaxLength: 200,
  titleMaxLength: 40,
  nicknameMaxLength: 20,
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

/** 커뮤니티 피드 정렬 옵션(§프롬프트 10) - 조회수·좋아요는 트래킹 기능이 아직
 *  없어서 제외. UI 드롭다운과 API 쿼리 파라미터 검증(FEED_SORT_VALUES) 양쪽에서 재사용. */
export const FEED_SORT_OPTIONS: { value: FeedSort; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "popular", label: "인기순" },
  { value: "distance", label: "거리순" },
  { value: "collected", label: "담아간 횟수순" },
];

export const FEED_SORT_VALUES: FeedSort[] = FEED_SORT_OPTIONS.map((option) => option.value);

/** 홈 탭 "이번 주 급상승" 위젯(§프롬프트 10) 설정값 */
export const TRENDING = {
  /** 최근 며칠간의 찜 증가량을 볼지 */
  windowDays: 7,
  /** 위젯에 보여줄 최대 장소 수 */
  limit: 5,
} as const;

/** 홈 탭 지역 랭킹 미리보기(§프롬프트 10)에서 보여줄 최대 장소 수 */
export const HOME_RANKING_PREVIEW_LIMIT = 5;

/** 지도로 보기(§프롬프트 11) 설정값 */
export const MAP = {
  /** 이 줌 레벨(포함) 이상이면 지역 버블 대신 개별 장소 마커로 전환.
   *  기존 보드 상세 지도(§MapView.tsx)의 기본 줌(13)과 맞춰서, 그 확대 정도면
   *  이미 "동네 안을 보는" 수준이라 개별 장소가 자연스럽다고 판단. */
  placeZoomThreshold: 13,
  /** 데이터가 하나도 없을 때(지역 buble이 아예 없을 때)의 기본 중심/줌 - 대한민국 전체가
   *  대충 보이는 좌표. */
  fallbackCenter: [36.5, 127.8] as [number, number],
  fallbackZoom: 7,
  /** 버블 반경(px) - 찜 카운트 0에 가까울수록 최소, 가장 많은 지역일수록 최대에 수렴 */
  bubbleMinRadius: 14,
  bubbleMaxRadius: 46,
} as const;
