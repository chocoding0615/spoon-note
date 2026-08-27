import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "../firebaseAdmin";
import { COMMUNITY, DEFAULT_NICKNAME } from "../constants";
import { extractRegion } from "../utils/region";
import { decideMatch, extractPlaceId, type MatchCandidate } from "./matching";
import type {
  Board,
  CanonicalPlace,
  CanonicalPlaceBoardLink,
  CanonicalPlaceRanking,
  CollectiblePlace,
  PlaceBoardSummary,
  PlaceSource,
} from "../types";

const CANONICAL_PLACES_COLLECTION = "canonicalPlaces";
const BOARD_LINKS_SUBCOLLECTION = "boards";
const BOARDS_COLLECTION = "boards";

/** 근사 매칭 후보를 찾기 위해 좌표가 대략 근처인 canonical place를 가져온다.
 *  Firestore에서 위도+경도를 동시에 범위 검색하려면 복합 색인이 필요해서, 위도만
 *  범위로 걸고(matchRadiusMeters보다 넉넉하게) 경도/실제 거리/이름 유사도는
 *  decideMatch가 메모리에서 정밀하게 거른다. canonical place 총량이 많지 않은
 *  지금 규모에선 충분하고, 늘어나면 geohash 인덱싱으로 바꿀 것. */
async function findGeoCandidates(lat: number): Promise<MatchCandidate[]> {
  const deltaLat = ((COMMUNITY.matchRadiusMeters * 3) / 111_000); // 위도 1도 ≈ 111km, 여유 3배
  const snap = await getDb()
    .collection(CANONICAL_PLACES_COLLECTION)
    .where("lat", ">=", lat - deltaLat)
    .where("lat", "<=", lat + deltaLat)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data() as CanonicalPlace;
    return { id: doc.id, placeName: data.placeName, lat: data.lat, lng: data.lng, sources: data.sources };
  });
}

/** 원본 ID가 있는 소스(네이버/카카오)는 canonicalId를 "source:placeId"로 고정한다.
 *  동시에 같은 장소가 처음 등록돼도 두 요청이 같은 문서 ID로 수렴해서 트랜잭션이
 *  자연히 직렬화한다(레이스로 canonical place가 중복 생성되지 않음). */
function deterministicCanonicalId(source: PlaceSource, placeId: string): string {
  return `${source}:${placeId}`;
}

export interface RecordPlaceSaveInput {
  entryId: string;
  boardId: string;
  source: PlaceSource;
  placeName: string;
  sourceUrl?: string;
  lat?: number;
  lng?: number;
  /** 최초 등록 시 region 계산 + "담아가기" 스냅샷(§CanonicalPlace.address/category/photos)에
   *  쓴다 - 이미 있는 canonical place에 매칭되면 전부 무시됨(최초 등록 시점에 고정). */
  address?: string;
  category?: string;
  photos?: string[];
}

/** 장소가 보드에 추가됐을 때 호출한다. 매칭되는 canonical place를 찾아
 *  saveCount를 트랜잭션으로 정확히 증가시키거나, 없으면 새로 만든다. 연결된
 *  canonicalId를 반환하니 호출부(entryService)가 엔트리에 저장해둬야 삭제
 *  시점에 정확히 되돌릴 수 있다.
 *
 *  매칭 후보 검색은 트랜잭션 밖에서 한다 - Firestore 트랜잭션은 임의의 where
 *  쿼리를 지원하지 않고, 무거운 스캔을 트랜잭션 안에 넣으면 경합 시 재시도
 *  비용만 커진다. **알려진 한계**: 원본 ID가 없는 소스(구글/manual)로 완전히
 *  새로운 장소를 두 요청이 동시에 처음 등록하면, 서로를 못 보고 canonical
 *  place가 중복 생성될 수 있다(원본 ID가 있는 소스는 canonicalId 자체가
 *  결정적이라 이 레이스가 없음). 좁은 엣지케이스라 MVP 규모에선 감수한다. */
export async function recordPlaceSave(input: RecordPlaceSaveInput): Promise<string> {
  const placeId = extractPlaceId(input.source, input.sourceUrl);
  const candidates =
    input.lat !== undefined && input.lng !== undefined ? await findGeoCandidates(input.lat) : [];

  const matched = decideMatch(
    { source: input.source, placeId, placeName: input.placeName, lat: input.lat, lng: input.lng },
    candidates
  );

  const db = getDb();
  const canonicalId =
    matched?.id ?? (placeId ? deterministicCanonicalId(input.source, placeId) : db.collection(CANONICAL_PLACES_COLLECTION).doc().id);

  const canonicalRef = db.collection(CANONICAL_PLACES_COLLECTION).doc(canonicalId);
  const boardLinkRef = canonicalRef.collection(BOARD_LINKS_SUBCOLLECTION).doc(input.boardId);

  await db.runTransaction(async (tx) => {
    // tx.get()을 Promise.all로 동시에 걸면 Admin SDK 트랜잭션에서 조용히 씹히는
    // 현상이 있었다(로컬 재현: 쓰기 자체가 반영 안 됨, 에러도 없음) - 순차로 바꿔서 해결.
    const canonicalSnap = await tx.get(canonicalRef);
    const boardLinkSnap = await tx.get(boardLinkRef);
    const now = Date.now();

    if (!canonicalSnap.exists) {
      const newPlace: CanonicalPlace = {
        placeName: input.placeName,
        lat: input.lat,
        lng: input.lng,
        region: extractRegion(input.address),
        address: input.address,
        category: input.category,
        photos: input.photos,
        saveCount: 1,
        sources: placeId ? [{ source: input.source, placeId, sourceUrl: input.sourceUrl ?? "" }] : [],
        createdAt: now,
        updatedAt: now,
      };
      tx.set(canonicalRef, newPlace);
    } else if (placeId) {
      const existing = canonicalSnap.data() as CanonicalPlace;
      const alreadyTracked = existing.sources.some((s) => s.source === input.source && s.placeId === placeId);
      if (!alreadyTracked) {
        tx.update(canonicalRef, {
          sources: FieldValue.arrayUnion({ source: input.source, placeId, sourceUrl: input.sourceUrl ?? "" }),
          updatedAt: now,
        });
      }
    }

    if (boardLinkSnap.exists) {
      // 같은 보드가 같은 장소를 또 담은 경우 - saveCount는 이미 반영돼있으니 entryId만 추가
      const link = boardLinkSnap.data() as CanonicalPlaceBoardLink;
      if (!link.entryIds.includes(input.entryId)) {
        tx.update(boardLinkRef, { entryIds: FieldValue.arrayUnion(input.entryId) });
      }
    } else {
      const link: CanonicalPlaceBoardLink = { boardId: input.boardId, entryIds: [input.entryId], addedAt: now };
      tx.set(boardLinkRef, link);
      // 새로 만든 canonical place는 이미 saveCount:1로 생성했으니 추가 증가는 기존 place에만 필요
      if (canonicalSnap.exists) {
        tx.update(canonicalRef, { saveCount: FieldValue.increment(1), updatedAt: now });
      }
    }
  });

  return canonicalId;
}

/** 엔트리가(보통 보드 통째 삭제로) 사라졌을 때 호출한다. 그 엔트리가 이
 *  보드에서 이 장소를 가리키는 마지막 연결이었다면 saveCount를 정확히 감소시킨다.
 *  canonicalId는 추가 시점에 엔트리에 저장해둔 값을 그대로 써야 한다(재매칭 금지 -
 *  그 사이 데이터가 바뀌면 다른 결과가 나올 수 있음). */
export async function removePlaceSave(entryId: string, boardId: string, canonicalId: string): Promise<void> {
  const canonicalRef = getDb().collection(CANONICAL_PLACES_COLLECTION).doc(canonicalId);
  const boardLinkRef = canonicalRef.collection(BOARD_LINKS_SUBCOLLECTION).doc(boardId);

  await getDb().runTransaction(async (tx) => {
    const boardLinkSnap = await tx.get(boardLinkRef);
    if (!boardLinkSnap.exists) return;

    const link = boardLinkSnap.data() as CanonicalPlaceBoardLink;
    const remainingEntryIds = link.entryIds.filter((id) => id !== entryId);

    if (remainingEntryIds.length > 0) {
      tx.update(boardLinkRef, { entryIds: remainingEntryIds });
      return; // 같은 보드의 다른 엔트리가 아직 이 장소를 가리킴 - count는 그대로
    }

    tx.delete(boardLinkRef);
    tx.update(canonicalRef, { saveCount: FieldValue.increment(-1), updatedAt: Date.now() });
  });
}

export async function getCanonicalPlace(canonicalId: string): Promise<CanonicalPlace | null> {
  const snap = await getDb().collection(CANONICAL_PLACES_COLLECTION).doc(canonicalId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as CanonicalPlace;
}

/** 지역 랭킹 페이지의 "담아가기"(프롬프트 8)용 - 랭킹 목록엔 이름/카운트만 있어서
 *  실제로 보드에 추가하려면 이 조회가 한 번 더 필요하다. source/sourceUrl은
 *  최초 등록 소스(sources[0])를 대표값으로 쓴다 - 원본 ID가 없는 소스(구글/manual)로
 *  등록됐다면 sources가 비어있을 수 있는데, 이땐 "manual"로 담아가는 것과
 *  동일하게 취급한다(원본 링크 자체가 없으니 자연스러운 처리). */
export async function getCollectiblePlace(canonicalId: string): Promise<CollectiblePlace | null> {
  const place = await getCanonicalPlace(canonicalId);
  if (!place) return null;

  const primarySource = place.sources[0];
  return {
    source: primarySource?.source ?? "manual",
    sourceUrl: primarySource?.sourceUrl || undefined,
    placeName: place.placeName,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    category: place.category,
    photos: place.photos,
  };
}

/** 보드 상세 화면에 찜 횟수 뱃지를 그리기 위해, 엔트리들이 가진 canonicalId
 *  목록을 한 번에 조회한다. getAll로 배치 조회해서 canonicalId 개수만큼
 *  순차 요청하지 않는다. 존재하지 않는 id(레이스 등으로 삭제된 경우)는 결과에서 빠진다 -
 *  호출부는 없는 id를 count 0(뱃지 숨김)으로 취급하면 된다. */
export async function getSaveCounts(canonicalIds: string[]): Promise<Record<string, number>> {
  const uniqueIds = Array.from(new Set(canonicalIds));
  if (uniqueIds.length === 0) return {};

  const db = getDb();
  const refs = uniqueIds.map((id) => db.collection(CANONICAL_PLACES_COLLECTION).doc(id));
  const snaps = await db.getAll(...refs);

  const result: Record<string, number> = {};
  snaps.forEach((snap) => {
    if (snap.exists) {
      result[snap.id] = (snap.data() as CanonicalPlace).saveCount;
    }
  });
  return result;
}

/** 지역 랭킹 페이지(프롬프트 7)용 - 특정 지역의 canonical place를 찜 횟수
 *  내림차순으로 돌려준다. region 조건만 where로 걸고(saveCount 범위 조건까지
 *  같이 걸면 복합 색인이 필요해짐 - 기존 원칙대로 회피) 0인 것 제외/정렬은
 *  메모리에서 처리한다. saveCount는 이미 "community" 보드만 반영된 값이라
 *  (entryService/boardService가 기록 시점에 게이팅) 별도 필터 불필요. */
export async function listRankedPlaces(region: string): Promise<CanonicalPlaceRanking[]> {
  const snap = await getDb().collection(CANONICAL_PLACES_COLLECTION).where("region", "==", region).get();

  return snap.docs
    .map((doc) => {
      const data = doc.data() as CanonicalPlace;
      return { id: doc.id, placeName: data.placeName, region: data.region ?? null, saveCount: data.saveCount };
    })
    .filter((place) => place.saveCount > 0)
    .sort((a, b) => b.saveCount - a.saveCount);
}

/** 지역 랭킹 페이지의 지역 선택 드롭다운에 쓸 지역 목록 - 실제로 찜 횟수가
 *  1 이상인 지역만(0곳인 지역을 골라봐야 빈 리스트만 보임). select()로 필요한
 *  필드만 읽어서 컬렉션 전체 문서를 다 읽는 비용을 줄인다. */
export async function listRegionsWithRankings(): Promise<string[]> {
  const snap = await getDb().collection(CANONICAL_PLACES_COLLECTION).select("region", "saveCount").get();

  const regions = new Set<string>();
  snap.docs.forEach((doc) => {
    const data = doc.data() as Pick<CanonicalPlace, "region" | "saveCount">;
    if (data.region && data.saveCount > 0) regions.add(data.region);
  });
  return Array.from(regions).sort();
}

/** 랭킹 항목을 펼쳤을 때 "이 장소를 찜한 보드 목록"을 보여주기 위한 조회.
 *  canonicalPlaces/{id}/boards 서브컬렉션 문서 ID가 boardId(=slug)로 고정돼
 *  있어서(§recordPlaceSave) 바로 배치 조회할 수 있다. */
export async function listBoardsForCanonicalPlace(canonicalId: string): Promise<PlaceBoardSummary[]> {
  const db = getDb();
  const linksSnap = await db
    .collection(CANONICAL_PLACES_COLLECTION)
    .doc(canonicalId)
    .collection(BOARD_LINKS_SUBCOLLECTION)
    .get();
  if (linksSnap.empty) return [];

  const boardSlugs = linksSnap.docs.map((doc) => doc.id);
  const refs = boardSlugs.map((slug) => db.collection(BOARDS_COLLECTION).doc(slug));
  const boardSnaps = await db.getAll(...refs);

  return boardSnaps
    .filter((snap) => snap.exists)
    .map((snap) => {
      const board = snap.data() as Board;
      return { slug: board.slug, title: board.title, authorName: board.nickname || DEFAULT_NICKNAME };
    });
}
