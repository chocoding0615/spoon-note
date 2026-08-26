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
  sourceUrl: string;
}

export interface ParseResponse {
  parsed: ParsedPlace | null;
}
