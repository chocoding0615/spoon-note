import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "../firebaseAdmin";
import { getCanonicalPlace, recordPlaceSave, removePlaceSave } from "./canonicalPlaceService";

// 실제 .env.local의 Firebase 프로젝트에 붙는 통합 테스트 - vitest.config.mts가
// .env.local을 읽어서 넘겨준다. 목(mock) 대신 실제 Firestore를 쓰는 이유: 이
// 기능의 핵심(트랜잭션 동시성)은 Firestore 에뮬레이터 없이 순수 mock으로는
// 의미 있게 검증하기 어렵다 - 이 프로젝트에 아직 에뮬레이터 설정이 없어서,
// 개발용 프로젝트에 실제로 쓰고 지우는 방식을 택했다(테스트 종료 시 정리함).
const CANONICAL_PLACES_COLLECTION = "canonicalPlaces";
const SAVE_EVENTS_COLLECTION = "placeSaveEvents";

// 카카오/네이버 실제 place ID는 순수 숫자 문자열이고, extractPlaceId의 정규식도
// 숫자만 매칭한다 - UUID를 쓰면 정규식이 안 걸려서 실제 동작과 다른 경로(근사
// 매칭/랜덤 ID)를 타게 된다.
function fakeNumericPlaceId(): string {
  return `${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

// 각 테스트가 서로 다른(50m 반경보다 훨씬 넓게 떨어진) 좌표를 쓰게 한다 - 같은
// 좌표를 여러 테스트가 공유하면, 어떤 테스트가 실패해서 정리가 안 된 경우 다음
// 실행에서 근사 매칭이 그 잔여 데이터에 잘못 걸릴 수 있다(실제로 겪은 문제).
let testLatSeq = 0;
function uniqueTestCoords(): { lat: number; lng: number } {
  testLatSeq += 1;
  return { lat: 30 + testLatSeq * 0.5, lng: 120 + testLatSeq * 0.5 }; // 테스트끼리 수십km씩 떨어뜨림
}

const createdCanonicalIds = new Set<string>();

afterEach(async () => {
  const db = getDb();
  for (const id of createdCanonicalIds) {
    const ref = db.collection(CANONICAL_PLACES_COLLECTION).doc(id);
    const boardLinks = await ref.collection("boards").get();
    await Promise.all(boardLinks.docs.map((doc) => doc.ref.delete()));
    await ref.delete().catch(() => {});
  }
  // recordPlaceSave가 새로 찜될 때마다 placeSaveEvents에도 이벤트를 남기니까
  // (§프롬프트 10 "이번 주 급상승") 이것도 안 지우면 테스트용 가짜 장소 이름이
  // 실제 프로젝트의 급상승 집계에 며칠간 섞여 들어간다 - 'in' 쿼리는 최대 10개까지라
  // createdCanonicalIds가 그보다 작은(테스트당 1~2개) 지금 규모에선 안전하다.
  if (createdCanonicalIds.size > 0) {
    const eventsSnap = await db
      .collection(SAVE_EVENTS_COLLECTION)
      .where("canonicalId", "in", Array.from(createdCanonicalIds).slice(0, 10))
      .get();
    await Promise.all(eventsSnap.docs.map((doc) => doc.ref.delete()));
  }
  createdCanonicalIds.clear();
});

describe("recordPlaceSave 동시성", () => {
  it("완전히 새로운 카카오 장소를 10개 보드가 동시에 담아도 saveCount가 정확히 10", async () => {
    const placeId = fakeNumericPlaceId();
    const sourceUrl = `https://place.map.kakao.com/${placeId}`;
    const canonicalId = `kakao:${placeId}`;
    createdCanonicalIds.add(canonicalId);
    const { lat, lng } = uniqueTestCoords();

    const boardIds = Array.from({ length: 10 }, () => `test-board-${randomUUID()}`);
    await Promise.all(
      boardIds.map((boardId, i) =>
        recordPlaceSave({
          entryId: `test-entry-${i}-${randomUUID()}`,
          boardId,
          source: "kakao",
          placeName: "동시성 테스트 장소",
          sourceUrl,
          lat,
          lng,
        })
      )
    );

    const place = await getCanonicalPlace(canonicalId);
    expect(place?.saveCount).toBe(10);
  }, 30000);

  it("같은 보드가 같은 장소를 두 번 담아도 saveCount는 1", async () => {
    const placeId = fakeNumericPlaceId();
    const sourceUrl = `https://place.map.kakao.com/${placeId}`;
    const canonicalId = `kakao:${placeId}`;
    createdCanonicalIds.add(canonicalId);
    const boardId = `test-board-${randomUUID()}`;
    const { lat, lng } = uniqueTestCoords();

    await recordPlaceSave({
      entryId: `test-entry-1-${randomUUID()}`,
      boardId,
      source: "kakao",
      placeName: "같은 보드 중복 테스트",
      sourceUrl,
      lat,
      lng,
    });
    await recordPlaceSave({
      entryId: `test-entry-2-${randomUUID()}`,
      boardId,
      source: "kakao",
      placeName: "같은 보드 중복 테스트",
      sourceUrl,
      lat,
      lng,
    });

    const place = await getCanonicalPlace(canonicalId);
    expect(place?.saveCount).toBe(1);
  });

  it("다른 서비스(네이버)가 좌표+이름으로 근사 매칭되면 같은 canonical place로 합쳐진다", async () => {
    const kakaoPlaceId = fakeNumericPlaceId();
    const canonicalId = `kakao:${kakaoPlaceId}`;
    createdCanonicalIds.add(canonicalId);
    const { lat, lng } = uniqueTestCoords();

    await recordPlaceSave({
      entryId: `test-entry-kakao-${randomUUID()}`,
      boardId: `test-board-${randomUUID()}`,
      source: "kakao",
      placeName: "근사매칭 테스트집",
      sourceUrl: `https://place.map.kakao.com/${kakaoPlaceId}`,
      lat,
      lng,
    });

    const { canonicalId: naverCanonicalId } = await recordPlaceSave({
      entryId: `test-entry-naver-${randomUUID()}`,
      boardId: `test-board-${randomUUID()}`,
      source: "naver",
      placeName: "근사매칭 테스트집",
      sourceUrl: `https://m.place.naver.com/place/${fakeNumericPlaceId()}`,
      lat: lat + 0.0002, // 수십 미터 차이 - 50m 반경 안
      lng: lng + 0.0002,
    });

    expect(naverCanonicalId).toBe(canonicalId);
    const place = await getCanonicalPlace(canonicalId);
    expect(place?.saveCount).toBe(2);
    expect(place?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "kakao" }),
        expect.objectContaining({ source: "naver" }),
      ])
    );
  });

  it("좌표가 멀면(50m 밖) 이름이 같아도 다른 서비스와 안 합쳐진다", async () => {
    const kakaoPlaceId = fakeNumericPlaceId();
    const kakaoCanonicalId = `kakao:${kakaoPlaceId}`;
    createdCanonicalIds.add(kakaoCanonicalId);
    const { lat, lng } = uniqueTestCoords();

    await recordPlaceSave({
      entryId: `test-entry-kakao-${randomUUID()}`,
      boardId: `test-board-${randomUUID()}`,
      source: "kakao",
      placeName: "먼거리 테스트집",
      sourceUrl: `https://place.map.kakao.com/${kakaoPlaceId}`,
      lat,
      lng,
    });

    const { canonicalId: naverCanonicalId } = await recordPlaceSave({
      entryId: `test-entry-naver-${randomUUID()}`,
      boardId: `test-board-${randomUUID()}`,
      source: "naver",
      placeName: "먼거리 테스트집",
      sourceUrl: `https://m.place.naver.com/place/${fakeNumericPlaceId()}`,
      lat: lat + 0.01, // 약 1km 이상 - 50m 반경 밖
      lng,
    });
    createdCanonicalIds.add(naverCanonicalId);

    expect(naverCanonicalId).not.toBe(kakaoCanonicalId);
    expect((await getCanonicalPlace(kakaoCanonicalId))?.saveCount).toBe(1);
    expect((await getCanonicalPlace(naverCanonicalId))?.saveCount).toBe(1);
  });
});

describe("removePlaceSave", () => {
  it("보드가 삭제되면 saveCount가 감소하고, 다른 보드의 연결은 안 건드린다", async () => {
    const placeId = fakeNumericPlaceId();
    const canonicalId = `kakao:${placeId}`;
    createdCanonicalIds.add(canonicalId);
    const sourceUrl = `https://place.map.kakao.com/${placeId}`;
    const { lat, lng } = uniqueTestCoords();

    const entryIdA = `test-entry-a-${randomUUID()}`;
    const entryIdB = `test-entry-b-${randomUUID()}`;
    const boardIdA = `test-board-a-${randomUUID()}`;
    const boardIdB = `test-board-b-${randomUUID()}`;

    await recordPlaceSave({
      entryId: entryIdA,
      boardId: boardIdA,
      source: "kakao",
      placeName: "삭제 테스트집",
      sourceUrl,
      lat,
      lng,
    });
    await recordPlaceSave({
      entryId: entryIdB,
      boardId: boardIdB,
      source: "kakao",
      placeName: "삭제 테스트집",
      sourceUrl,
      lat,
      lng,
    });

    expect((await getCanonicalPlace(canonicalId))?.saveCount).toBe(2);

    await removePlaceSave(entryIdA, boardIdA, canonicalId);

    const afterFirstRemoval = await getCanonicalPlace(canonicalId);
    expect(afterFirstRemoval?.saveCount).toBe(1);

    await removePlaceSave(entryIdB, boardIdB, canonicalId);
    const afterSecondRemoval = await getCanonicalPlace(canonicalId);
    expect(afterSecondRemoval?.saveCount).toBe(0);
  });
});
