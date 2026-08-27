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
  /** 이 엔트리가 연결된 canonicalPlaces 문서 ID. 매칭 시점에 결정돼 엔트리에
   *  고정 저장한다 - 삭제 시 그때 다시 매칭을 계산하면 그사이 데이터가 바뀌어
   *  다른 결과가 나올 수 있어서, 추가 당시 결정된 값을 그대로 써서 감소시켜야 함 */
  canonicalId?: string;
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

/** 서로 다른 소스(네이버/카카오/구글)에서 같은 실제 장소를 가리키는 엔트리들을
 *  하나로 묶은 것. "몇 개의 보드에 찜됐는지"(saveCount) 집계의 단위가 된다. */
export interface CanonicalPlace {
  id?: string;
  placeName: string;
  lat?: number;
  lng?: number;
  /** 이 장소를 담은 서로 다른 보드 수 - 엔트리 수가 아니라 보드 수(한 보드가
   *  같은 장소를 두 번 담아도 1로만 집계). 정확한 집계는
   *  canonicalPlaces/{id}/boards 서브컬렉션 문서 존재 여부로 트랜잭션 안에서 판정. */
  saveCount: number;
  /** 원본 링크/ID들 - 나중에 잘못 묶인 걸 수동으로 분리할 수 있게 전부 유지 */
  sources: { source: PlaceSource; placeId: string; sourceUrl: string }[];
  createdAt: number;
  updatedAt: number;
}

/** canonicalPlaces/{canonicalId}/boards/{boardId} 서브컬렉션 문서.
 *  문서 ID를 boardId로 고정해서, 트랜잭션 안에서 "이 보드가 이미 카운트에
 *  반영됐는지"를 쿼리 없이 결정적으로(get by ID) 확인할 수 있게 한다. */
export interface CanonicalPlaceBoardLink {
  boardId: string;
  /** 같은 보드에서 이 장소를 가리키는 엔트리 ID들(보통 1개, 중복 추가 시 여러 개) */
  entryIds: string[];
  addedAt: number;
}
