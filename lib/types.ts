export type PlaceSource = "naver" | "kakao" | "google" | "manual";
// 비공개(나만) / 링크공유(링크 아는 사람만) / 커뮤니티공개(누구나 + 커뮤니티 노출 대상).
// 예전엔 "public"이 이 자리에 있었는데, 실제로는 "링크공유"랑 다를 게 없었다
// (커뮤니티 노출 기능 자체가 없었음) - 새로 생긴 진짜 공개 개념과 이름이
// 겹치면 혼란스러워서 "community"로 새로 만들고 예전 "public" 값은 폐기.
// 기존에 그 값으로 저장된 문서는 boardService.migratePublicVisibility()로
// "unlisted"로 옮긴다(커뮤니티에 자동 노출되면 안 되므로).
export type Visibility = "private" | "unlisted" | "community";

export interface Board {
  id?: string;
  slug: string; // 공유 URL: /b/[slug]
  title: string;
  description?: string;
  theme?: string;
  visibility: Visibility;
  /** 커뮤니티공개일 때 표시할 이름. 없으면 DEFAULT_NICKNAME으로 표시(읽는 시점에 폴백). */
  nickname?: string;
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
  /** 최초 등록 시점 주소에서 뽑은 시/구 단위 지역(§lib/utils/region.ts). 장소가
   *  이동할 일은 없다고 보고 생성 시 한 번만 정하고 이후엔 갱신하지 않는다.
   *  주소가 없거나 지역을 못 뽑으면 null. */
  region?: string | null;
  /** "담아가기"(프롬프트 8)로 다른 보드에 옮길 때 쓸 스냅샷 - 최초 등록 엔트리
   *  기준으로 한 번만 저장하고 이후 갱신하지 않는다(주소가 바뀌어도 이 장소를
   *  최초로 커뮤니티에 등록한 시점 정보 그대로 - MVP 수준에선 충분). */
  address?: string;
  category?: string;
  photos?: string[];
  /** 이 장소를 담은 서로 다른 "커뮤니티공개" 보드 수 - 엔트리 수가 아니라 보드 수(한 보드가
   *  같은 장소를 두 번 담아도 1로만 집계). 비공개/링크공유 보드는 집계에서 제외된다
   *  (entryService.addEntry/boardService.updateBoard가 visibility가 "community"일 때만
   *  이 카운트에 반영되도록 호출을 게이팅한다). 정확한 집계는
   *  canonicalPlaces/{id}/boards 서브컬렉션 문서 존재 여부로 트랜잭션 안에서 판정. */
  saveCount: number;
  /** 원본 링크/ID들 - 나중에 잘못 묶인 걸 수동으로 분리할 수 있게 전부 유지 */
  sources: { source: PlaceSource; placeId: string; sourceUrl: string }[];
  createdAt: number;
  updatedAt: number;
}

/** 지역 랭킹 페이지(프롬프트 7)에 보여줄 canonical place 한 항목. */
export interface CanonicalPlaceRanking {
  id: string;
  placeName: string;
  region: string | null;
  saveCount: number;
}

/** 랭킹 항목을 펼쳤을 때 보여줄 "이 장소를 찜한 보드" 요약. */
export interface PlaceBoardSummary {
  slug: string;
  title: string;
  authorName: string;
}

/** 커뮤니티 피드(프롬프트 6) 카드 하나. */
export interface FeedBoardCard {
  slug: string;
  title: string;
  authorName: string;
  entryCount: number;
  region: string | null;
  coverPhoto: string | null;
  /** canonical place 찜 횟수가 임계값(COMMUNITY.goldThreshold) 이상인 장소 개수 */
  popularCount: number;
  createdAt: number;
}

/** 신고된 보드 기록(관리자만 Firestore 콘솔에서 직접 확인 - 별도 admin UI 없음). */
export interface BoardReport {
  id?: string;
  boardSlug: string;
  boardTitle: string;
  createdAt: number;
}

/** "담아가기"(프롬프트 8)로 다른 보드에 옮길 수 있는 장소 하나 - AddEntryInput과
 *  같은 모양이라 기존 "장소를 보드에 추가" 로직(entryService.addEntry)을 그대로
 *  재사용할 수 있다. 보드 상세 화면에서는 Entry를 그대로 이 모양으로 변환해서
 *  쓰고, 지역 랭킹 페이지에서는 canonicalPlaceService.getCollectiblePlace로
 *  서버에서 조회해서 쓴다(랭킹 목록엔 이름/카운트만 있어서 부족함). */
export interface CollectiblePlace {
  source: PlaceSource;
  placeName: string;
  address?: string;
  lat?: number;
  lng?: number;
  category?: string;
  photos?: string[];
  sourceUrl?: string;
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
