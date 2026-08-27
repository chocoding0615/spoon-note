import { NextResponse } from "next/server";
import { listBoardsForCanonicalPlace } from "@/lib/services/canonicalPlaceService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 지역 랭킹 페이지(프롬프트 7)에서 항목을 펼칠 때만 호출한다 - 랭킹 목록을 처음
// 불러올 때 모든 장소의 연결 보드까지 한꺼번에 내려주면 낭비라 지연 조회로 뺐다.
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const boards = await listBoardsForCanonicalPlace(id);
    return NextResponse.json({ boards });
  } catch (error) {
    console.error("[canonical-places] 연결 보드 조회 실패:", error);
    return NextResponse.json({ error: "연결된 보드를 불러오지 못했어요." }, { status: 500 });
  }
}
