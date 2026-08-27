import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { CanonicalPlaceRanking } from "@/lib/types";

interface RankingPreviewProps {
  region: string;
  places: CanonicalPlaceRanking[];
}

const MEDALS = ["🥇", "🥈", "🥉"] as const;

export function RankingPreview({ region, places }: RankingPreviewProps) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-stone-900">{region ? `${region} 맛집 랭킹 TOP 5` : "맛집 랭킹 TOP 5"}</h2>
        <Link href={region ? `/rankings?region=${encodeURIComponent(region)}` : "/rankings"} className="text-xs font-medium text-accent hover:underline">
          더보기
        </Link>
      </div>

      {places.length === 0 ? (
        <p className="py-4 text-center text-sm text-stone-400">아직 이 지역엔 찜된 장소가 없어요</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {places.map((place, index) => (
            <li key={place.id} className="flex items-center gap-3 text-sm">
              <span className="w-6 shrink-0 text-center">{MEDALS[index] ?? index + 1}</span>
              <span className="flex-1 truncate font-medium text-stone-900">{place.placeName}</span>
              <span className="shrink-0 text-stone-500">🔥 {place.saveCount}곳</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
