import type { Metadata } from "next";
import { listCommunityFeed } from "@/lib/services/feedService";
import { FeedCard } from "@/components/community/FeedCard";
import { RegionSelect } from "@/components/community/RegionSelect";

export const metadata: Metadata = {
  title: "커뮤니티 피드",
  description: "커뮤니티공개로 설정된 스푼노트 보드를 최신순으로 둘러보세요.",
};

interface PageProps {
  searchParams: Promise<{ region?: string }>;
}

export default async function CommunityFeedPage({ searchParams }: PageProps) {
  const { region } = await searchParams;
  const { cards, regions } = await listCommunityFeed(region);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-stone-900">커뮤니티 피드</h1>
        {regions.length > 0 && <RegionSelect regions={regions} value={region ?? ""} allLabel="전체 지역" />}
      </div>

      {cards.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-stone-200 text-sm text-stone-400">
          {region ? "이 지역엔 아직 커뮤니티에 공개된 보드가 없어요" : "아직 커뮤니티에 공개된 보드가 없어요"}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {cards.map((card) => (
            <FeedCard key={card.slug} card={card} />
          ))}
        </div>
      )}
    </main>
  );
}
