import type { Metadata } from "next";
import { listRankedPlaces, listRegionsWithRankings } from "@/lib/services/canonicalPlaceService";
import { RankingList } from "@/components/rankings/RankingList";
import { RegionSelect } from "@/components/community/RegionSelect";

export const metadata: Metadata = {
  title: "지역 랭킹",
  description: "커뮤니티공개 보드에서 많이 찜한 장소를 지역별로 확인하세요.",
};

interface PageProps {
  searchParams: Promise<{ region?: string }>;
}

export default async function RankingsPage({ searchParams }: PageProps) {
  const { region: requestedRegion } = await searchParams;
  const regions = await listRegionsWithRankings();
  // 아직 region 선택이 없으면 첫 지역을 기본값으로 보여준다(요구사항: 지역 선택이
  // 전제라 빈 화면보다 뭔가 보여주는 쪽이 낫다) - URL은 그대로 두고 렌더링만 기본값을 쓴다.
  const region = requestedRegion || regions[0] || "";
  const places = region ? await listRankedPlaces(region) : [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-stone-900">지역 랭킹</h1>
        {regions.length > 0 && <RegionSelect regions={regions} value={region} />}
      </div>

      {regions.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-stone-200 text-sm text-stone-400">
          아직 커뮤니티에 찜된 장소가 없어요
        </div>
      ) : (
        <RankingList places={places} />
      )}
    </main>
  );
}
