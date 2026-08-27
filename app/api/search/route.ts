import { NextResponse, type NextRequest } from "next/server";
import { listRegionsWithRankings, searchPlaces } from "@/lib/services/canonicalPlaceService";

const RESULT_LIMIT = 8;

export interface SearchResultItem {
  type: "place" | "region";
  label: string;
  sublabel?: string;
  href: string;
}

// 홈 탭 검색창(§프롬프트 10) - 장소명/카테고리는 searchPlaces(접두어 매칭)로,
// 지역은 이미 갖고 있는 지역 목록에서 부분일치로 찾는다. 두 결과 다 아직
// "장소 상세" 페이지가 없어서 지역 랭킹/커뮤니티 피드로 연결한다.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ results: [] });

  try {
    const [places, regions] = await Promise.all([searchPlaces(q, RESULT_LIMIT), listRegionsWithRankings()]);

    const regionResults: SearchResultItem[] = regions
      .filter((region) => region.includes(q))
      .slice(0, 3)
      .map((region) => ({
        type: "region",
        label: region,
        href: `/community?region=${encodeURIComponent(region)}`,
      }));

    const placeResults: SearchResultItem[] = places.map((place) => ({
      type: "place",
      label: place.placeName,
      sublabel: place.region ?? undefined,
      href: place.region ? `/rankings?region=${encodeURIComponent(place.region)}` : "/rankings",
    }));

    return NextResponse.json({ results: [...regionResults, ...placeResults].slice(0, RESULT_LIMIT) });
  } catch (error) {
    console.error("[search] 검색 실패:", error);
    return NextResponse.json({ error: "검색하지 못했어요." }, { status: 500 });
  }
}
