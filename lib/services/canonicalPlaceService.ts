import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "../firebaseAdmin";
import { COMMUNITY } from "../constants";
import { decideMatch, extractPlaceId, type MatchCandidate } from "./matching";
import type { CanonicalPlace, CanonicalPlaceBoardLink, PlaceSource } from "../types";

const CANONICAL_PLACES_COLLECTION = "canonicalPlaces";
const BOARD_LINKS_SUBCOLLECTION = "boards";

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
