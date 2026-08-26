import { randomUUID } from "node:crypto";
import { getDb } from "../firebaseAdmin";
import { generateSlug } from "../utils/slug";
import { LIMITS } from "../constants";
import { ValidationError, OwnershipError } from "./errors";
import type { Board, Visibility } from "../types";

const BOARDS_COLLECTION = "boards";
const ENTRIES_COLLECTION = "entries";

export interface CreateBoardInput {
  title: string;
  description?: string;
  theme?: string;
  visibility: Visibility;
}

export async function createBoard(input: CreateBoardInput): Promise<Board> {
  const title = input.title.trim().slice(0, LIMITS.titleMaxLength);
  if (!title) throw new ValidationError("제목을 입력해주세요.");

  const db = getDb();

  // 8자 slug(32^8 조합)라 충돌 확률은 사실상 0에 가깝지만, 그래도 재시도는 걸어둔다.
  let slug = generateSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.collection(BOARDS_COLLECTION).doc(slug).get();
    if (!existing.exists) break;
    slug = generateSlug();
  }

  const board: Board = {
    slug,
    title,
    description: input.description?.trim() || undefined,
    theme: input.theme,
    visibility: input.visibility,
    ownerKey: randomUUID(),
    createdAt: Date.now(),
  };

  await db.collection(BOARDS_COLLECTION).doc(slug).set(board);
  return board;
}

export async function getBoardBySlug(slug: string): Promise<Board | null> {
  const snap = await getDb().collection(BOARDS_COLLECTION).doc(slug).get();
  if (!snap.exists) return null;
  return snap.data() as Board;
}

/**
 * visibility 정책을 적용해 "이 요청자가 실제로 볼 수 있는" 보드만 돌려준다.
 * private 보드는 ownerKey가 일치하지 않으면 존재 자체를 숨긴다(null 반환 → 404).
 */
export async function getViewableBoard(slug: string, ownerKey?: string): Promise<Board | null> {
  const board = await getBoardBySlug(slug);
  if (!board) return null;
  if (board.visibility === "private" && board.ownerKey !== ownerKey) return null;
  return board;
}

export async function listBoardsByOwnerKeys(ownerKeys: string[]): Promise<Board[]> {
  if (ownerKeys.length === 0) return [];
  // Firestore 'in' 쿼리는 최대 30개 - freeBoards 제한(3개) 안에서는 항상 충분하다.
  const snap = await getDb()
    .collection(BOARDS_COLLECTION)
    .where("ownerKey", "in", ownerKeys.slice(0, 30))
    .get();
  return snap.docs.map((doc) => doc.data() as Board);
}

export interface UpdateBoardInput {
  title?: string;
  description?: string;
  theme?: string;
  visibility?: Visibility;
}

export async function updateBoard(
  slug: string,
  ownerKey: string,
  patch: UpdateBoardInput
): Promise<Board | null> {
  const ref = getDb().collection(BOARDS_COLLECTION).doc(slug);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const board = snap.data() as Board;
  if (board.ownerKey !== ownerKey) throw new OwnershipError();

  const update: Partial<Board> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim().slice(0, LIMITS.titleMaxLength);
    if (!title) throw new ValidationError("제목을 입력해주세요.");
    update.title = title;
  }
  if (patch.description !== undefined) update.description = patch.description.trim();
  if (patch.theme !== undefined) update.theme = patch.theme;
  if (patch.visibility !== undefined) update.visibility = patch.visibility;

  await ref.update(update);
  return { ...board, ...update };
}

export async function deleteBoard(slug: string, ownerKey: string): Promise<boolean> {
  const db = getDb();
  const ref = db.collection(BOARDS_COLLECTION).doc(slug);
  const snap = await ref.get();
  if (!snap.exists) return false;

  const board = snap.data() as Board;
  if (board.ownerKey !== ownerKey) throw new OwnershipError();

  const entriesSnap = await db.collection(ENTRIES_COLLECTION).where("boardId", "==", slug).get();
  const batch = db.batch();
  entriesSnap.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(ref);
  await batch.commit();

  return true;
}
