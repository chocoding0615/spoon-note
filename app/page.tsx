import {
  listRankedPlaces,
  listRegionCentroids,
  listRegionsWithRankings,
  listTrendingPlaces,
} from "@/lib/services/canonicalPlaceService";
import { RegionPicker } from "@/components/home/RegionPicker";
import { SearchBar } from "@/components/home/SearchBar";
import { TrendingWidget } from "@/components/home/TrendingWidget";
import { RankingPreview } from "@/components/home/RankingPreview";
import { CurationBannerSlot } from "@/components/home/CurationBannerSlot";
import { MapEntryCard } from "@/components/home/MapEntryCard";
import { HOME_RANKING_PREVIEW_LIMIT, TRENDING } from "@/lib/constants";

interface PageProps {
  searchParams: Promise<{ region?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const { region: requestedRegion } = await searchParams;
  const [regions, centroids, trending] = await Promise.all([
    listRegionsWithRankings(),
    listRegionCentroids(),
    listTrendingPlaces(TRENDING.windowDays, TRENDING.limit),
  ]);
  // 랭킹 페이지와 같은 패턴 - 아직 지역 선택이 없으면 첫 지역을 기본값으로.
  const region = requestedRegion || regions[0] || "";
  const places = region ? await listRankedPlaces(region) : [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-6 py-8">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🥄</span>
        <h1 className="text-lg font-bold text-stone-900">스푼노트</h1>
      </div>

      {regions.length > 0 && (
        <RegionPicker
          regions={regions}
          value={region}
          hasExplicitRegion={Boolean(requestedRegion)}
          centroids={centroids}
        />
      )}

      <SearchBar />

      <TrendingWidget places={trending} windowDays={TRENDING.windowDays} />

      {region && <RankingPreview region={region} places={places.slice(0, HOME_RANKING_PREVIEW_LIMIT)} />}

      <CurationBannerSlot />

      <MapEntryCard />
    </main>
  );
}
