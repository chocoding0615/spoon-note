import { getDb } from "../firebaseAdmin";
import { COMMUNITY, DEFAULT_NICKNAME } from "../constants";
import { dominantRegion } from "../utils/region";
import { haversineDistanceMeters } from "../utils/geo";
import { listEntries } from "./entryService";
import { getCollectCounts, getSaveCounts } from "./canonicalPlaceService";
import type { Board, Entry, FeedBoardCard, FeedSort } from "../types";

const BOARDS_COLLECTION = "boards";

export interface CommunityFeedOptions {
  region?: string;
  sort?: FeedSort;
  /** "거리순" 기준점(§프롬프트 10) - 브라우저 geolocation으로 얻은 사용자 위치.
   *  없으면 거리 계산이 불가능하니 "최신순"과 동일하게 동작한다(§sortCards). */
  origin?: { lat: number; lng: number };
}

export interface CommunityFeedResult {
  cards: FeedBoardCard[];
  /** 지역 필터 드롭다운용 - regionFilter 적용 전 전체 커뮤니티 보드 기준으로
   *  뽑는다(필터링된 뒤 목록에서 뽑으면 선택할수록 옵션이 줄어드는 이상한 UX가 됨). */
  regions: string[];
}

/** 엔트리 중 좌표를 가진 것들의 평균 - 보드의 "대표 위치"(§거리순 정렬).
 *  좌표가 하나도 없으면 null(정렬 시 맨 뒤로 밀림). */
function representativeCoords(entries: Entry[]): { lat: number; lng: number } | null {
  const withCoords = entries.filter(
    (entry): entry is Entry & { lat: number; lng: number } => entry.lat !== undefined && entry.lng !== undefined
  );
  if (withCoords.length === 0) return null;

  const sum = withCoords.reduce(
    (acc, entry) => ({ lat: acc.lat + entry.lat, lng: acc.lng + entry.lng }),
    { lat: 0, lng: 0 }
  );
  return { lat: sum.lat / withCoords.length, lng: sum.lng / withCoords.length };
}

function sortCards(cards: FeedBoardCard[], sort: FeedSort, origin?: { lat: number; lng: number }): FeedBoardCard[] {
  switch (sort) {
    case "popular":
      return [...cards].sort((a, b) => b.totalSaveCount - a.totalSaveCount);
    case "collected":
      return [...cards].sort((a, b) => b.collectedCount - a.collectedCount);
    case "distance": {
      // origin이 없으면(위치 권한 거부 등) 거리 계산이 불가능하니 "최신순"으로
      // 폴백한다(요구사항 "사용자 위치 또는 마지막 선택 지역" 중 위치가 없을 때의
      // 최소 동작 - 지역은 이미 region 필터로 반영돼 있어 남은 후보끼리는
      // 최신순이 자연스럽다).
      if (!origin) return [...cards].sort((a, b) => b.communityAt - a.communityAt);
      return [...cards].sort((a, b) => {
        const da = a.lat !== null && a.lng !== null ? haversineDistanceMeters(origin, { lat: a.lat, lng: a.lng }) : Infinity;
        const db = b.lat !== null && b.lng !== null ? haversineDistanceMeters(origin, { lat: b.lat, lng: b.lng }) : Infinity;
        return da - db;
      });
    }
    case "latest":
    default:
      return [...cards].sort((a, b) => b.communityAt - a.communityAt);
  }
}

/** 커뮤니티 피드(프롬프트 6, 정렬 옵션은 프롬프트 10). 보드 개수가 많지 않은 MVP
 *  규모를 전제로 보드마다 엔트리를 따로 조회한다(N+1) - 카드에 필요한 대표사진/
 *  장소 개수/지역/대표좌표를 만들려면 결국 엔트리를 읽어야 해서 피할 수 없고,
 *  늘어나면 보드 문서에 요약 필드를 얹어 캐싱하는 쪽으로 바꿀 것. saveCount/
 *  collectCount는 전체 보드의 canonicalId를 모아 한 번만 배치 조회해서
 *  (getSaveCounts/getCollectCounts) 이 부분은 N+1을 피한다. */
export async function listCommunityFeed(options: CommunityFeedOptions = {}): Promise<CommunityFeedResult> {
  const { region: regionFilter, sort = "latest", origin } = options;
  const boardsSnap = await getDb().collection(BOARDS_COLLECTION).where("visibility", "==", "community").get();
  const boards = boardsSnap.docs.map((doc) => doc.data() as Board);

  const entriesByBoard = new Map<string, Entry[]>();
  await Promise.all(
    boards.map(async (board) => {
      entriesByBoard.set(board.slug, await listEntries(board.slug));
    })
  );

  const allCanonicalIds = Array.from(entriesByBoard.values())
    .flat()
    .map((entry) => entry.canonicalId)
    .filter((id): id is string => Boolean(id));
  const [saveCounts, collectCounts] = await Promise.all([
    getSaveCounts(allCanonicalIds),
    getCollectCounts(allCanonicalIds),
  ]);

  const allCards: FeedBoardCard[] = boards.map((board) => {
    const entries = entriesByBoard.get(board.slug) ?? [];
    const coverPhoto = entries.find((entry) => (entry.photos?.length ?? 0) > 0)?.photos?.[0] ?? null;
    const popularCount = entries.filter((entry) => {
      const count = entry.canonicalId ? (saveCounts[entry.canonicalId] ?? 0) : 0;
      return count >= COMMUNITY.goldThreshold;
    }).length;
    const totalSaveCount = entries.reduce(
      (sum, entry) => sum + (entry.canonicalId ? (saveCounts[entry.canonicalId] ?? 0) : 0),
      0
    );
    const collectedCount = entries.reduce(
      (sum, entry) => sum + (entry.canonicalId ? (collectCounts[entry.canonicalId] ?? 0) : 0),
      0
    );
    const coords = representativeCoords(entries);

    return {
      slug: board.slug,
      title: board.title,
      authorName: board.nickname || DEFAULT_NICKNAME,
      entryCount: entries.length,
      region: dominantRegion(entries),
      coverPhoto,
      popularCount,
      totalSaveCount,
      collectedCount,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      createdAt: board.createdAt,
      communityAt: board.communityAt ?? board.createdAt,
    };
  });

  const regions = Array.from(
    new Set(allCards.map((card) => card.region).filter((region): region is string => Boolean(region)))
  ).sort();

  const filtered = regionFilter ? allCards.filter((card) => card.region === regionFilter) : allCards;
  const cards = sortCards(filtered, sort, origin);

  return { cards, regions };
}
