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
  MapPlace,
  PlaceBoardSummary,
  PlaceSaveEvent,
  PlaceSource,
  RegionCentroid,
  RegionDensity,
  TrendingPlace,
} from "../types";

const CANONICAL_PLACES_COLLECTION = "canonicalPlaces";
const BOARD_LINKS_SUBCOLLECTION = "boards";
const BOARDS_COLLECTION = "boards";
const SAVE_EVENTS_COLLECTION = "placeSaveEvents";
const REGION_STATS_COLLECTION = "regionStats";

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
export async function recordPlaceSave(
  input: RecordPlaceSaveInput
): Promise<{ canonicalId: string; isNewSave: boolean }> {
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

  // "이번 주 급상승" 집계용 - saveCount가 실제로 늘어나는 순간(아래 else 분기)에만
  // true가 된다. 같은 보드가 같은 장소를 또 담는 경우(entryIds만 추가)는 신규
  // 찜이 아니므로 이벤트를 남기지 않는다.
  let isNewSave = false;
  // 지도로 보기(§프롬프트 11)의 지역 밀도 캐시(regionStats) 갱신용 - 새로 만든
  // canonical place일 때만 좌표를 합산해야(centroid 이중 집계 방지) 해서
  // isNewSave와 별개로 추적한다.
  let isNewPlace = false;
  let regionForStats: string | null = null;

  await db.runTransaction(async (tx) => {
    // tx.get()을 Promise.all로 동시에 걸면 Admin SDK 트랜잭션에서 조용히 씹히는
    // 현상이 있었다(로컬 재현: 쓰기 자체가 반영 안 됨, 에러도 없음) - 순차로 바꿔서 해결.
    const canonicalSnap = await tx.get(canonicalRef);
    const boardLinkSnap = await tx.get(boardLinkRef);
    const now = Date.now();

    // 기존 place면 등록 당시 고정된 region을 그대로 쓰고(재계산 금지 원칙,
    // §CanonicalPlace.region 주석과 동일), 새로 만드는 거면 지금 지어준다.
    regionForStats = canonicalSnap.exists
      ? ((canonicalSnap.data() as CanonicalPlace).region ?? null)
      : extractRegion(input.address);

    if (!canonicalSnap.exists) {
      isNewPlace = true;
      const newPlace: CanonicalPlace = {
        placeName: input.placeName,
        lat: input.lat,
        lng: input.lng,
        region: regionForStats,
        address: input.address,
        category: input.category,
        photos: input.photos,
        saveCount: 1,
        collectCount: 0,
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
      isNewSave = true;
      const link: CanonicalPlaceBoardLink = { boardId: input.boardId, entryIds: [input.entryId], addedAt: now };
      tx.set(boardLinkRef, link);
      // 새로 만든 canonical place는 이미 saveCount:1로 생성했으니 추가 증가는 기존 place에만 필요
      if (canonicalSnap.exists) {
        tx.update(canonicalRef, { saveCount: FieldValue.increment(1), updatedAt: now });
      }
    }
  });

  if (isNewSave) {
    // 급상승 집계는 부가 기능이라 실패해도 찜 자체는 이미 끝난 뒤다(fail-open) -
    // recordSaveEvent 내부에서 자체적으로 에러를 삼킨다.
    await recordSaveEvent(canonicalId);
    if (regionForStats) {
      await incrementRegionStat({
        region: regionForStats,
        deltaSaveCount: 1,
        // 좌표 합산(centroid용)은 이 장소가 이 트랜잭션에서 "처음" 만들어졌을
        // 때만 - 이미 있던 장소가 다른 보드에 또 찜된 경우 좌표를 또 더하면
        // 같은 장소가 여러 번 잡혀서 centroid가 왜곡된다.
        addCoords: isNewPlace && input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng } : null,
      });
    }
  }

  return { canonicalId, isNewSave };
}

/** canonicalId가 새로 찜될 때마다 타임스탬프 하나를 남긴다(§PlaceSaveEvent).
 *  집계 전용 부가 기능이라 실패해도 호출부(recordPlaceSave)의 핵심 동작에
 *  영향을 주면 안 된다 - 여기서 에러를 삼킨다(fail-open). */
async function recordSaveEvent(canonicalId: string): Promise<void> {
  try {
    const event: PlaceSaveEvent = { canonicalId, createdAt: Date.now() };
    await getDb().collection(SAVE_EVENTS_COLLECTION).add(event);
  } catch (error) {
    console.error("[canonicalPlaces] 급상승 집계용 이벤트 기록 실패:", error);
  }
}

interface RegionStatUpdate {
  region: string;
  /** saveCount 합계 증감분 - 새로 찜되면 +1, saveCount가 실제로 줄어들면 -1 */
  deltaSaveCount: number;
  /** centroid(지도 중심 좌표) 누적용 - 이 지역에 속한 canonical place가 새로
   *  생겼을 때만 넘긴다(§recordPlaceSave의 isNewPlace). null이면 좌표 집계는
   *  건드리지 않는다. */
  addCoords: { lat: number; lng: number } | null;
}

/** 지도로 보기(§프롬프트 11)의 지역별 밀도 캐시 - "지역 단위 집계를 매 요청마다
 *  실시간 계산하면 비용 부담"이라는 요구사항 5에 따라, canonicalPlaces
 *  컬렉션을 매번 스캔·집계하는 대신 찜 카운트가 실제로 바뀌는 시점(recordPlaceSave/
 *  removePlaceSave)마다 regionStats/{region} 문서 하나를 증분 갱신해두고
 *  지도는 이 작은 캐시 컬렉션만 읽는다. `set(..., {merge:true})` + increment라
 *  문서가 없어도(이 지역의 첫 찜) 안전하게 생성되면서 증가한다. 부가 기능이라
 *  실패해도 찜 저장 자체는 이미 끝난 뒤다(fail-open). */
async function incrementRegionStat(update: RegionStatUpdate): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      region: update.region,
      totalSaveCount: FieldValue.increment(update.deltaSaveCount),
      updatedAt: Date.now(),
    };
    if (update.addCoords) {
      payload.latSum = FieldValue.increment(update.addCoords.lat);
      payload.lngSum = FieldValue.increment(update.addCoords.lng);
      payload.coordCount = FieldValue.increment(1);
    }
    await getDb().collection(REGION_STATS_COLLECTION).doc(update.region).set(payload, { merge: true });
  } catch (error) {
    console.error("[canonicalPlaces] 지역 밀도 캐시 갱신 실패:", error);
  }
}

/** "담아가기"(프롬프트 8)가 성공했을 때 호출한다 - 담는 보드의 공개설정과
 *  무관하게 항상 증가시켜야 하는 별개 카운터라(§CanonicalPlace.collectCount)
 *  saveCount 집계(recordPlaceSave)와는 완전히 분리된 경로다. 부가 기능이라
 *  실패해도 "장소 담기" 자체는 이미 끝난 뒤다(fail-open, 호출부에서 캐치). */
export async function incrementCollectCount(canonicalId: string): Promise<void> {
  await getDb()
    .collection(CANONICAL_PLACES_COLLECTION)
    .doc(canonicalId)
    .update({ collectCount: FieldValue.increment(1), updatedAt: Date.now() });
}

/** 엔트리가(보통 보드 통째 삭제로) 사라졌을 때 호출한다. 그 엔트리가 이
 *  보드에서 이 장소를 가리키는 마지막 연결이었다면 saveCount를 정확히 감소시킨다.
 *  canonicalId는 추가 시점에 엔트리에 저장해둔 값을 그대로 써야 한다(재매칭 금지 -
 *  그 사이 데이터가 바뀌면 다른 결과가 나올 수 있음). */
export async function removePlaceSave(entryId: string, boardId: string, canonicalId: string): Promise<void> {
  const canonicalRef = getDb().collection(CANONICAL_PLACES_COLLECTION).doc(canonicalId);
  const boardLinkRef = canonicalRef.collection(BOARD_LINKS_SUBCOLLECTION).doc(boardId);

  let didDecrement = false;
  let regionForStats: string | null = null;

  await getDb().runTransaction(async (tx) => {
    const canonicalSnap = await tx.get(canonicalRef);
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
    didDecrement = true;
    regionForStats = canonicalSnap.exists ? ((canonicalSnap.data() as CanonicalPlace).region ?? null) : null;
  });

  if (didDecrement && regionForStats) {
    // 지도 밀도 캐시(§incrementRegionStat) 반대 방향 갱신 - 좌표 합산(centroid)은
    // canonical place 문서 자체를 안 지우니(재사용 대비) 여기선 건드리지 않는다.
    await incrementRegionStat({ region: regionForStats, deltaSaveCount: -1, addCoords: null });
  }
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
    canonicalId: place.id,
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

/** getSaveCounts와 같은 배치 조회 패턴이되 collectCount 기준(§커뮤니티 피드
 *  "담아간 횟수순", 프롬프트 10). */
export async function getCollectCounts(canonicalIds: string[]): Promise<Record<string, number>> {
  const uniqueIds = Array.from(new Set(canonicalIds));
  if (uniqueIds.length === 0) return {};

  const db = getDb();
  const refs = uniqueIds.map((id) => db.collection(CANONICAL_PLACES_COLLECTION).doc(id));
  const snaps = await db.getAll(...refs);

  const result: Record<string, number> = {};
  snaps.forEach((snap) => {
    if (snap.exists) {
      result[snap.id] = (snap.data() as CanonicalPlace).collectCount ?? 0;
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

/** 홈 탭 검색창(§프롬프트 10, "장소/카테고리 검색") - Firestore는 전문검색을
 *  지원하지 않아 필드값 range 쿼리로 흉내낸 "접두어 일치"만 가능하다(예:
 *  "마라"로 검색하면 "마라탕"은 걸리지만 "동대문마라탕"은 안 걸림 - MVP 수준의
 *  알려진 한계, 나중에 Algolia/Typesense 같은 외부 검색엔진으로 개선 가능).
 *  placeName과 category 양쪽에 접두어 매칭을 걸어 합친다("카테고리 검색"은
 *  별도 필터 UI 없이 이름과 같은 검색창에서 매칭되는 방식으로 지원). 커뮤니티에
 *  전혀 안 찜된(saveCount 0) 곳은 결과에서 뺀다 - 아직 아무도 안 담은 장소는
 *  보여줘도 갈 곳(랭킹/피드)이 없다. */
export async function searchPlaces(query: string, limit: number): Promise<CanonicalPlaceRanking[]> {
  const q = query.trim();
  if (!q) return [];

  const db = getDb();
  const upperBound = `${q}`;
  const [byName, byCategory] = await Promise.all([
    db.collection(CANONICAL_PLACES_COLLECTION).where("placeName", ">=", q).where("placeName", "<", upperBound).get(),
    db.collection(CANONICAL_PLACES_COLLECTION).where("category", ">=", q).where("category", "<", upperBound).get(),
  ]);

  const byId = new Map<string, CanonicalPlaceRanking>();
  [...byName.docs, ...byCategory.docs].forEach((doc) => {
    if (byId.has(doc.id)) return;
    const data = doc.data() as CanonicalPlace;
    if (data.saveCount <= 0) return;
    byId.set(doc.id, { id: doc.id, placeName: data.placeName, region: data.region ?? null, saveCount: data.saveCount });
  });

  return Array.from(byId.values())
    .sort((a, b) => b.saveCount - a.saveCount)
    .slice(0, limit);
}

/** 홈 탭 "이번 주 급상승"(프롬프트 10)용 - 최근 days일 안에 새로 찜된
 *  (recordPlaceSave가 isNewSave로 기록한) 이벤트를 canonicalId별로 세어 많이
 *  늘어난 순으로 상위 limit개를 돌려준다. 단일 필드(createdAt) range 쿼리라
 *  복합 색인이 필요 없다 - 집계 자체는 메모리에서 처리(이벤트 총량이 많지 않은
 *  MVP 규모 전제, §listCommunityFeed와 같은 전략). */
export async function listTrendingPlaces(days: number, limit: number): Promise<TrendingPlace[]> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const snap = await getDb().collection(SAVE_EVENTS_COLLECTION).where("createdAt", ">=", cutoff).get();
  if (snap.empty) return [];

  const counts = new Map<string, number>();
  snap.docs.forEach((doc) => {
    const event = doc.data() as PlaceSaveEvent;
    counts.set(event.canonicalId, (counts.get(event.canonicalId) ?? 0) + 1);
  });

  const topIds = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
  if (topIds.length === 0) return [];

  const db = getDb();
  const refs = topIds.map((id) => db.collection(CANONICAL_PLACES_COLLECTION).doc(id));
  const placeSnaps = await db.getAll(...refs);

  return placeSnaps
    .filter((placeSnap) => placeSnap.exists)
    .map((placeSnap) => {
      const data = placeSnap.data() as CanonicalPlace;
      return {
        id: placeSnap.id,
        placeName: data.placeName,
        region: data.region ?? null,
        recentCount: counts.get(placeSnap.id) ?? 0,
      };
    })
    .sort((a, b) => b.recentCount - a.recentCount);
}

/** 홈 탭 "현재 위치로 찾기"(프롬프트 10)용 - 지역마다 좌표를 가진 canonical
 *  place들의 평균 좌표를 대표 좌표로 써서, 사용자 현재 위치와 가장 가까운
 *  지역을 클라이언트에서 고를 수 있게 한다. select()로 필요한 필드만 읽는다
 *  (§listRegionsWithRankings와 같은 이유 - 컬렉션 전체를 다 읽지 않기 위함). */
export async function listRegionCentroids(): Promise<RegionCentroid[]> {
  const snap = await getDb().collection(CANONICAL_PLACES_COLLECTION).select("region", "lat", "lng").get();

  const sums = new Map<string, { latSum: number; lngSum: number; count: number }>();
  snap.docs.forEach((doc) => {
    const data = doc.data() as Pick<CanonicalPlace, "region" | "lat" | "lng">;
    if (!data.region || data.lat === undefined || data.lng === undefined) return;
    const entry = sums.get(data.region) ?? { latSum: 0, lngSum: 0, count: 0 };
    entry.latSum += data.lat;
    entry.lngSum += data.lng;
    entry.count += 1;
    sums.set(data.region, entry);
  });

  return Array.from(sums.entries()).map(([region, { latSum, lngSum, count }]) => ({
    region,
    lat: latSum / count,
    lng: lngSum / count,
  }));
}

/** regionStats는 이 기능이 생긴 이후의 찜/철회에만 반응해서 갱신되니, 이미
 *  쌓여있던 canonicalPlaces 데이터는 저절로 안 채워진다(§incrementRegionStat).
 *  배포 직후 한 번 실행해서 기존 데이터 기준으로 캐시를 처음 채우는 용도 -
 *  `migratePublicVisibility`(boardService.ts)와 같은 "필요할 때 수동 실행하는
 *  1회성 backfill" 패턴. increment가 아니라 canonicalPlaces 전체를 다시 합산해
 *  통째로 덮어쓰기(set)라서 여러 번 실행해도 항상 같은 결과(멱등적). */
export async function backfillRegionStats(): Promise<number> {
  const snap = await getDb().collection(CANONICAL_PLACES_COLLECTION).select("region", "saveCount", "lat", "lng").get();

  const sums = new Map<string, { totalSaveCount: number; latSum: number; lngSum: number; coordCount: number }>();
  snap.docs.forEach((doc) => {
    const data = doc.data() as Pick<CanonicalPlace, "region" | "saveCount" | "lat" | "lng">;
    if (!data.region) return;
    const entry = sums.get(data.region) ?? { totalSaveCount: 0, latSum: 0, lngSum: 0, coordCount: 0 };
    entry.totalSaveCount += data.saveCount;
    if (data.lat !== undefined && data.lng !== undefined) {
      entry.latSum += data.lat;
      entry.lngSum += data.lng;
      entry.coordCount += 1;
    }
    sums.set(data.region, entry);
  });

  const db = getDb();
  const batch = db.batch();
  const now = Date.now();
  sums.forEach((value, region) => {
    batch.set(db.collection(REGION_STATS_COLLECTION).doc(region), { region, ...value, updatedAt: now });
  });
  await batch.commit();

  return sums.size;
}

/** 지도로 보기(§프롬프트 11)의 낮은 줌 레벨(전체 지역 조망)용 - regionStats
 *  캐시 컬렉션만 읽는다(요구사항 5: canonicalPlaces 전체를 매번 스캔·집계하지
 *  않기 위해 §incrementRegionStat이 미리 쌓아둔 값). 문서 수가 지역 개수만큼이라
 *  (많아야 수십~수백) 컬렉션 전체를 한 번에 읽어도 부담 없다. */
export async function listRegionDensity(): Promise<RegionDensity[]> {
  const snap = await getDb().collection(REGION_STATS_COLLECTION).get();

  return snap.docs
    .map((doc) => {
      const data = doc.data() as {
        region: string;
        totalSaveCount: number;
        latSum?: number;
        lngSum?: number;
        coordCount?: number;
      };
      const hasCoords = (data.coordCount ?? 0) > 0;
      return {
        region: data.region,
        totalSaveCount: data.totalSaveCount,
        lat: hasCoords ? (data.latSum ?? 0) / (data.coordCount as number) : null,
        lng: hasCoords ? (data.lngSum ?? 0) / (data.coordCount as number) : null,
      };
    })
    .filter((density) => density.totalSaveCount > 0);
}

/** 지도로 보기(§프롬프트 11)의 높은 줌 레벨(개별 장소 마커)용 - 좌표와 지역이
 *  있고 실제로 찜된(saveCount > 0) canonical place만. 지역 필터 없이 전체를
 *  한 번에 내려주고 확대/축소는 클라이언트에서 처리한다(MVP 규모 전제 -
 *  §listCommunityFeed와 같은 원칙, 커지면 지도 바운딩 박스 기준 쿼리로 바꿀 것). */
export async function listMapPlaces(): Promise<MapPlace[]> {
  const snap = await getDb()
    .collection(CANONICAL_PLACES_COLLECTION)
    .select("placeName", "address", "lat", "lng", "region", "saveCount")
    .get();

  return snap.docs
    .map((doc) => {
      const data = doc.data() as Pick<CanonicalPlace, "placeName" | "address" | "lat" | "lng" | "region" | "saveCount">;
      return {
        id: doc.id,
        placeName: data.placeName,
        address: data.address ?? null,
        lat: data.lat,
        lng: data.lng,
        region: data.region ?? null,
        saveCount: data.saveCount,
      };
    })
    .filter(
      (place): place is MapPlace =>
        place.saveCount > 0 && place.lat !== undefined && place.lng !== undefined
    );
}
