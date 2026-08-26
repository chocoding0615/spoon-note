export type PlaceSource = "naver" | "kakao" | "google" | "manual";
export type Visibility = "public" | "unlisted" | "private"; // 전체공개/일부공개(링크소지자)/비공개

export interface Board {
  id?: string;
  slug: string; // 공유 URL: /b/[slug]
  title: string;
  description?: string;
  theme?: string;
  visibility: Visibility;
  ownerKey: string;
  createdAt: number;
}

export interface Entry {
  id?: string;
  boardId: string;
  source: PlaceSource;
  placeName: string;
  address?: string;
  lat?: number;
  lng?: number;
  category?: string;
  photos?: string[]; // 폴더 링크 가져오기(placelist import)로 채워짐 - 단일 링크 추가는 이 필드 없이도 동작함
  sourceUrl?: string;
  memo?: string; // 한 줄 감상
  stars?: 1 | 2 | 3 | 4 | 5;
  rank: number; // 보드 내 드래그 순위
  country?: string; // Phase 3 집계 대비, 지금부터 수집
  city?: string;
  authorName?: string;
  createdAt: number;
}

// Phase 2에서만 사용. 지금은 타입만 선언
export interface UserProfile {
  uid: string;
  nickname: string;
  ageBand: "10s" | "20s" | "30s" | "40s+" | "undisclosed";
  gender?: "female" | "male" | "other";
}

/** POST /api/parse 응답 형태 */
export interface ParsedPlace {
  source: PlaceSource;
  placeName: string;
  address?: string;
  lat?: number;
  lng?: number;
  category?: string;
  photos?: string[]; // 폴더 링크 가져오기(placelist import)에서만 채워짐
  sourceUrl: string;
}

export interface ParseResponse {
  parsed: ParsedPlace | null;
}

/** 폴더(저장 목록) 링크에서 가져온 장소 하나 - 현재 보드에 이미 있는지 여부까지 서버가 판정해서 내려준다. */
export interface ImportListPlace extends ParsedPlace {
  isDuplicate: boolean;
}

/** POST /api/boards/[slug]/import-list 응답 형태.
 *  isPlacelist가 false면 폴더 링크가 아니라는 뜻 - 클라이언트는 기존 단일 링크
 *  파싱(/api/parse) 흐름으로 넘어간다. */
export interface ImportListResponse {
  isPlacelist: boolean;
  source?: PlaceSource;
  places?: ImportListPlace[];
  totalCount?: number;
  importedCount?: number;
  truncated?: boolean;
  /** 파서가 끝까지 못 가져오고 중간에 실패해서 지금까지 모은 것만 반환한 경우 true */
  partial?: boolean;
  error?: string;
}
