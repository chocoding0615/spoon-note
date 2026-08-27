import { getDb } from "../firebaseAdmin";
import { NotFoundError } from "./errors";
import type { Board, BoardReport } from "../types";

const BOARDS_COLLECTION = "boards";
const REPORTS_COLLECTION = "boardReports";

/** 최소 신고 기능(프롬프트 6) - 본격적인 모더레이션 시스템은 이번 범위 밖이라,
 *  신고는 그냥 기록만 하고(중복/횟수 제한, 사유 입력 없음) 별도 컬렉션에 쌓아둔다.
 *  관리자가 Firestore 콘솔에서 직접 확인하는 걸 전제로 admin UI는 따로 안 만듦. */
export async function reportBoard(slug: string): Promise<void> {
  const db = getDb();
  const boardSnap = await db.collection(BOARDS_COLLECTION).doc(slug).get();
  if (!boardSnap.exists) throw new NotFoundError("보드를 찾을 수 없어요.");

  const board = boardSnap.data() as Board;
  const report: BoardReport = {
    boardSlug: slug,
    boardTitle: board.title,
    createdAt: Date.now(),
  };
  await db.collection(REPORTS_COLLECTION).add(report);
}
