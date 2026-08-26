import { getDb } from "../firebaseAdmin";
import { LIMITS, SOURCE_META } from "../constants";
import { ValidationError, OwnershipError, NotFoundError } from "./errors";
import type { Board, Entry } from "../types";

const BOARDS_COLLECTION = "boards";
const ENTRIES_COLLECTION = "entries";

async function getBoardOrThrow(slug: string): Promise<Board> {
  const snap = await getDb().collection(BOARDS_COLLECTION).doc(slug).get();
  if (!snap.exists) throw new NotFoundError("보드를 찾을 수 없어요.");
  return snap.data() as Board;
}

export async function listEntries(slug: string): Promise<Entry[]> {
  // where + orderBy를 같이 걸면 Firestore가 복합 색인을 요구한다(프로젝트마다
  // 콘솔에서 수동 생성 필요). freeEntriesPerBoard(50)로 상한이 있어 정렬은
  // 메모리에서 처리해도 충분하니, 색인 설정 없이 바로 되게 rank는 JS에서 정렬.
  const snap = await getDb().collection(ENTRIES_COLLECTION).where("boardId", "==", slug).get();
  const entries = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Entry);
  return entries.sort((a, b) => a.rank - b.rank);
}

export interface AddEntryInput {
  source: Entry["source"];
  placeName: string;
  address?: string;
  lat?: number;
  lng?: number;
  category?: string;
  sourceUrl?: string;
  memo?: string;
  stars?: Entry["stars"];
  country?: string;
  city?: string;
  authorName?: string;
}

const VALID_SOURCES = Object.keys(SOURCE_META) as Entry["source"][];

export async function addEntry(slug: string, input: AddEntryInput): Promise<Entry> {
  await getBoardOrThrow(slug);

  // 요청 shape 매핑(타입 캐스팅)은 라우트가 하지만, 값 자체가 의미상 맞는지는
  // 서비스 계층에서 검증한다(PLAN.md 원칙 7).
  if (!VALID_SOURCES.includes(input.source)) {
    throw new ValidationError("지원하지 않는 출처예요.");
  }
  if (input.stars !== undefined && (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5)) {
    throw new ValidationError("별점은 1부터 5 사이여야 해요.");
  }
  if (input.lat !== undefined && (input.lat < -90 || input.lat > 90)) {
    throw new ValidationError("위치 정보가 올바르지 않아요.");
  }
  if (input.lng !== undefined && (input.lng < -180 || input.lng > 180)) {
    throw new ValidationError("위치 정보가 올바르지 않아요.");
  }

  const placeName = input.placeName.trim();
  if (!placeName) throw new ValidationError("장소 이름을 입력해주세요.");

  const db = getDb();
  const existing = await db.collection(ENTRIES_COLLECTION).where("boardId", "==", slug).get();
  if (existing.size >= LIMITS.freeEntriesPerBoard) {
    throw new ValidationError(`보드 하나에는 최대 ${LIMITS.freeEntriesPerBoard}개까지 담을 수 있어요.`);
  }

  const maxRank = existing.docs.reduce(
    (max, doc) => Math.max(max, (doc.data().rank as number | undefined) ?? 0),
    0
  );

  const entry: Omit<Entry, "id"> = {
    boardId: slug,
    source: input.source,
    placeName,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    category: input.category,
    sourceUrl: input.sourceUrl,
    memo: input.memo?.trim().slice(0, LIMITS.memoMaxLength) || undefined,
    stars: input.stars,
    rank: maxRank + 1,
    country: input.country,
    city: input.city,
    authorName: input.authorName?.trim() || undefined,
    createdAt: Date.now(),
  };

  const ref = await db.collection(ENTRIES_COLLECTION).add(entry);
  return { id: ref.id, ...entry };
}

export async function reorderEntries(slug: string, ownerKey: string, orderedIds: string[]): Promise<void> {
  const board = await getBoardOrThrow(slug);
  if (board.ownerKey !== ownerKey) throw new OwnershipError();
  if (orderedIds.length === 0) return;

  const db = getDb();
  // orderedIds가 실제로 이 보드 소속 엔트리인지 먼저 확인한다 - 안 그러면 A 보드
  // ownerKey로 B 보드 엔트리 ID를 섞어 넣어 남의 보드 rank를 조작할 수 있다.
  // 소속 아닌 ID는 에러 없이 조용히 무시(존재 여부를 유추할 수 있는 단서를 안 줌).
  const existing = await db.collection(ENTRIES_COLLECTION).where("boardId", "==", slug).get();
  const ownedIds = new Set(existing.docs.map((doc) => doc.id));
  const validIds = orderedIds.filter((id) => ownedIds.has(id));
  if (validIds.length === 0) return;

  const batch = db.batch();
  validIds.forEach((id, index) => {
    batch.update(db.collection(ENTRIES_COLLECTION).doc(id), { rank: index + 1 });
  });
  await batch.commit();
}
