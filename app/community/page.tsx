import type { Metadata } from "next";
import { listCommunityFeed } from "@/lib/services/feedService";
import { FeedCard } from "@/components/community/FeedCard";
import { RegionSelect } from "@/components/community/RegionSelect";
import { SortSelect } from "@/components/community/SortSelect";
import { FEED_SORT_VALUES } from "@/lib/constants";
import type { FeedSort } from "@/lib/types";

export const metadata: Metadata = {
  title: "커뮤니티 피드",
  description: "커뮤니티공개로 설정된 스푼노트 보드를 둘러보세요.",
};

interface PageProps {
  searchParams: Promise<{ region?: string; sort?: string; lat?: string; lng?: string }>;
}

function isFeedSort(value: string | undefined): value is FeedSort {
  return FEED_SORT_VALUES.includes(value as FeedSort);
}

export default async function CommunityFeedPage({ searchParams }: PageProps) {
  const { region, sort: sortParam, lat, lng } = await searchParams;
  const sort: FeedSort = isFeedSort(sortParam) ? sortParam : "latest";
  const origin = lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined;
  const { cards, regions } = await listCommunityFeed({ region, sort, origin });

  // 두 드롭다운이 서로의 쿼리 파라미터를 지우지 않도록 상대방 값을 preserveParams로 넘긴다.
  const regionPreserve = { sort, ...(lat && lng ? { lat, lng } : {}) };
  const sortPreserve: Record<string, string> = region ? { region } : {};

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-stone-900">커뮤니티 피드</h1>
        <div className="flex items-center gap-2">
          <SortSelect value={sort} preserveParams={sortPreserve} />
          {regions.length > 0 && (
            <RegionSelect regions={regions} value={region ?? ""} allLabel="전체 지역" preserveParams={regionPreserve} />
          )}
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-stone-200 text-sm text-stone-400">
          {region ? "이 지역엔 아직 커뮤니티에 공개된 보드가 없어요" : "아직 커뮤니티에 공개된 보드가 없어요"}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {cards.map((card) => (
            <FeedCard key={card.slug} card={card} sort={sort} origin={origin} />
          ))}
        </div>
      )}
    </main>
  );
}
