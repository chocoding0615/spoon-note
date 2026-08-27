import { Card } from "@/components/ui/Card";
import type { TrendingPlace } from "@/lib/types";

interface TrendingWidgetProps {
  places: TrendingPlace[];
  windowDays: number;
}

export function TrendingWidget({ places, windowDays }: TrendingWidgetProps) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="font-semibold text-stone-900">📈 이번 주 급상승</h2>

      {places.length === 0 ? (
        <p className="py-4 text-center text-sm text-stone-400">최근 {windowDays}일간 새로 찜된 장소가 아직 없어요</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {places.map((place) => (
            <li key={place.id} className="flex items-center gap-3 text-sm">
              <span className="flex-1 truncate font-medium text-stone-900">{place.placeName}</span>
              {place.region && <span className="shrink-0 text-xs text-stone-400">{place.region}</span>}
              <span className="shrink-0 text-amber-600">+{place.recentCount}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
