import Link from "next/link";
import { Card } from "@/components/ui/Card";

export function MapEntryCard() {
  return (
    <Link href="/map">
      <Card className="flex items-center gap-3 p-5 transition-shadow hover:shadow-md">
        <span className="text-2xl">🗺️</span>
        <div className="flex-1">
          <p className="font-medium text-stone-900">지도로 보기</p>
          <p className="text-xs text-stone-500">지역별 찜 개수를 지도에서 한눈에 확인해보세요</p>
        </div>
        <span className="text-stone-400">›</span>
      </Card>
    </Link>
  );
}
