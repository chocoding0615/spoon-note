import { NextResponse } from "next/server";
import { getCollectiblePlace } from "@/lib/services/canonicalPlaceService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 지역 랭킹 페이지의 "담아가기"(프롬프트 8) 전용 - 랭킹 목록엔 이름/카운트만 있어서
// 실제로 다른 보드에 담으려면 이 조회로 주소/좌표/사진/원본 링크를 마저 가져와야 한다.
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const place = await getCollectiblePlace(id);
    if (!place) return NextResponse.json({ error: "장소를 찾을 수 없어요." }, { status: 404 });
    return NextResponse.json({ place });
  } catch (error) {
    console.error("[canonical-places] 조회 실패:", error);
    return NextResponse.json({ error: "장소를 불러오지 못했어요." }, { status: 500 });
  }
}
