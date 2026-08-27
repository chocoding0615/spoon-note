import { getDb } from "../firebaseAdmin";
import { COMMUNITY, DEFAULT_NICKNAME } from "../constants";
import { dominantRegion } from "../utils/region";
import { listEntries } from "./entryService";
import { getSaveCounts } from "./canonicalPlaceService";
import type { Board, Entry, FeedBoardCard } from "../types";

const BOARDS_COLLECTION = "boards";

export interface CommunityFeedResult {
  cards: FeedBoardCard[];
  /** 지역 필터 드롭다운용 - regionFilter 적용 전 전체 커뮤니티 보드 기준으로
   *  뽑는다(필터링된 뒤 목록에서 뽑으면 선택할수록 옵션이 줄어드는 이상한 UX가 됨). */
  regions: string[];
}

/** 커뮤니티 피드(프롬프트 6). 보드 개수가 많지 않은 MVP 규모를 전제로 보드마다
 *  엔트리를 따로 조회한다(N+1) - 카드에 필요한 대표사진/장소 개수/지역을 만들려면
 *  결국 엔트리를 읽어야 해서 피할 수 없고, 늘어나면 보드 문서에 요약 필드를
 *  얹어 캐싱하는 쪽으로 바꿀 것. saveCounts는 전체 보드의 canonicalId를 모아
 *  한 번만 배치 조회해서(getSaveCounts) 이 부분은 N+1을 피한다. */
export async function listCommunityFeed(regionFilter?: string): Promise<CommunityFeedResult> {
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
  const saveCounts = await getSaveCounts(allCanonicalIds);

  const allCards: FeedBoardCard[] = boards.map((board) => {
    const entries = entriesByBoard.get(board.slug) ?? [];
    const coverPhoto = entries.find((entry) => (entry.photos?.length ?? 0) > 0)?.photos?.[0] ?? null;
    const popularCount = entries.filter((entry) => {
      const count = entry.canonicalId ? (saveCounts[entry.canonicalId] ?? 0) : 0;
      return count >= COMMUNITY.goldThreshold;
    }).length;

    return {
      slug: board.slug,
      title: board.title,
      authorName: board.nickname || DEFAULT_NICKNAME,
      entryCount: entries.length,
      region: dominantRegion(entries),
      coverPhoto,
      popularCount,
      createdAt: board.createdAt,
    };
  });

  const regions = Array.from(
    new Set(allCards.map((card) => card.region).filter((region): region is string => Boolean(region)))
  ).sort();

  const filtered = regionFilter ? allCards.filter((card) => card.region === regionFilter) : allCards;
  const cards = filtered.sort((a, b) => b.createdAt - a.createdAt);

  return { cards, regions };
}
