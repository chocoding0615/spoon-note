import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { claimBoardsForAccount } from "@/lib/services/boardService";

// "내 계정으로 가져오기"(§설계안 03) - 클라이언트가 localStorage에 남아있는
// ownerKey 목록을 보내면, 로그인된 계정에 일괄로 연결한다.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  const rawOwnerKeys = (body as { ownerKeys?: unknown } | null)?.ownerKeys;
  const ownerKeys = Array.isArray(rawOwnerKeys)
    ? rawOwnerKeys.filter((key): key is string => typeof key === "string")
    : [];

  try {
    const claimedCount = await claimBoardsForAccount(session.uid, ownerKeys);
    return NextResponse.json({ claimedCount });
  } catch (error) {
    console.error("[account] 보드 가져오기 실패:", error);
    return NextResponse.json({ error: "보드를 가져오지 못했어요." }, { status: 500 });
  }
}
