import { getDb } from "../firebaseAdmin";
import { LIMITS } from "../constants";
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
  const snap = await getDb()
    .collection(ENTRIES_COLLECTION)
    .where("boardId", "==", slug)
    .orderBy("rank", "asc")
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Entry);
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

export async function addEntry(slug: string, input: AddEntryInput): Promise<Entry> {
  await getBoardOrThrow(slug);

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
  const batch = db.batch();
  orderedIds.forEach((id, index) => {
    batch.update(db.collection(ENTRIES_COLLECTION).doc(id), { rank: index + 1 });
  });
  await batch.commit();
}
