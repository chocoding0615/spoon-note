import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "../firebaseAdmin";
import { generateSlug } from "../utils/slug";
import { LIMITS } from "../constants";
import { ValidationError, OwnershipError } from "./errors";
import { recordPlaceSave, removePlaceSave } from "./canonicalPlaceService";
import type { Board, Entry, Visibility } from "../types";

const BOARDS_COLLECTION = "boards";
const ENTRIES_COLLECTION = "entries";

export interface CreateBoardInput {
  title: string;
  description?: string;
  theme?: string;
  visibility: Visibility;
  nickname?: string;
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
    nickname: input.nickname?.trim().slice(0, LIMITS.nicknameMaxLength) || undefined,
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
  nickname?: string;
}

/** visibility가 "community"로/에서 바뀔 때, 이미 담겨있던 엔트리들의 canonical
 *  place 집계도 같이 맞춰준다(프롬프트 7 - 커뮤니티공개 보드만 집계에 반영).
 *  entryService.addEntry는 "추가 시점" 보드 visibility만 보고 게이팅하므로,
 *  기존 엔트리들은 여기서 별도로 반영해줘야 뒤늦게 어긋나지 않는다.
 *  보드 visibility 변경 자체는 이미 끝난 뒤 호출되는 부가 동작이라 fail-open. */
async function syncCanonicalCountsOnVisibilityChange(
  slug: string,
  fromVisibility: Visibility,
  toVisibility: Visibility
): Promise<void> {
  const wasCommunity = fromVisibility === "community";
  const isCommunity = toVisibility === "community";
  if (wasCommunity === isCommunity) return; // 커뮤니티 <-> 커뮤니티 밖 전환이 아니면 카운트 변화 없음

  const db = getDb();
  const entriesSnap = await db.collection(ENTRIES_COLLECTION).where("boardId", "==", slug).get();

  if (isCommunity) {
    // 비공개/링크공유 -> 커뮤니티: 아직 집계 안 된(canonicalId 없는) 기존 엔트리들을 새로 반영
    await Promise.all(
      entriesSnap.docs.map(async (doc) => {
        const entry = doc.data() as Entry;
        if (entry.canonicalId) return;
        try {
          const canonicalId = await recordPlaceSave({
            entryId: doc.id,
            boardId: slug,
            source: entry.source,
            placeName: entry.placeName,
            sourceUrl: entry.sourceUrl,
            lat: entry.lat,
            lng: entry.lng,
            address: entry.address,
          });
          await doc.ref.update({ canonicalId });
        } catch (error) {
          console.error("[boards] 커뮤니티 전환 시 canonical place 집계 실패:", error);
        }
      })
    );
  } else {
    // 커뮤니티 -> 비공개/링크공유: 더 이상 집계 대상이 아니니 canonicalId를 떼고 카운트를 되돌림
    await Promise.all(
      entriesSnap.docs.map(async (doc) => {
        const entry = doc.data() as Entry;
        if (!entry.canonicalId) return;
        try {
          await removePlaceSave(doc.id, slug, entry.canonicalId);
          await doc.ref.update({ canonicalId: FieldValue.delete() });
        } catch (error) {
          console.error("[boards] 커뮤니티 이탈 시 canonical place 감소 실패:", error);
        }
      })
    );
  }
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
  if (patch.nickname !== undefined) {
    update.nickname = patch.nickname.trim().slice(0, LIMITS.nicknameMaxLength) || undefined;
  }

  await ref.update(update);

  if (patch.visibility !== undefined && patch.visibility !== board.visibility) {
    await syncCanonicalCountsOnVisibilityChange(slug, board.visibility, patch.visibility);
  }

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

  // canonical place 집계는 부가 기능이라 여기서 실패해도 보드 삭제 자체는
  // 이미 끝난 뒤다(fail-open) - 카운트가 어긋나는 것보다 삭제가 막히는 게 더 나쁘다.
  await Promise.all(
    entriesSnap.docs.map(async (doc) => {
      const entry = doc.data() as Entry;
      if (!entry.canonicalId) return;
      try {
        await removePlaceSave(doc.id, slug, entry.canonicalId);
      } catch (error) {
        console.error("[boards] canonical place 감소 실패(보드 삭제 자체는 완료):", error);
      }
    })
  );

  return true;
}

/** 공개설정 3단계 재구성(2026-08-27) 전에 만들어진 보드 중 예전 "public" 값을
 *  가진 게 있으면 "unlisted"로 옮긴다. "public"은 예전에도 링크만 있으면 누구나
 *  볼 수 있다는 뜻이었을 뿐 실제 커뮤니티 노출 기능은 없었으니, 새로 생긴
 *  "community"로 자동 승격시키면 안 된다(사용자가 명시적으로 다시 선택해야 함).
 *  Firestore는 스키마를 강제하지 않아 이 값이 남아있어도 조용히 실패하진
 *  않지만, VISIBILITY_OPTIONS에 없는 값이라 라벨이 안 뜨는 등 화면이 깨진다.
 *  멱등적이라 여러 번 실행해도 안전함 - 실행할 게 남아있으면 바뀐 문서 수를 반환. */
export async function migratePublicVisibility(): Promise<number> {
  const db = getDb();
  const snap = await db.collection(BOARDS_COLLECTION).where("visibility", "==", "public").get();
  if (snap.empty) return 0;

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.update(doc.ref, { visibility: "unlisted" }));
  await batch.commit();
  return snap.size;
}
