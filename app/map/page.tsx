import type { Metadata } from "next";
import Link from "next/link";
import { listMapPlaces, listRegionDensity } from "@/lib/services/canonicalPlaceService";
import { DensityMapViewLoader } from "@/components/map/DensityMapViewLoader";

export const metadata: Metadata = {
  title: "지도로 보기",
  description: "지역별 찜 개수를 지도에서 확인해보세요.",
};

export default async function MapPage() {
  const [densities, places] = await Promise.all([listRegionDensity(), listMapPlaces()]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-stone-900">지도로 보기</h1>
        <Link href="/" className="text-sm font-medium text-accent hover:underline">
          홈으로
        </Link>
      </div>

      <DensityMapViewLoader densities={densities} places={places} />

      <p className="text-xs text-stone-400">
        🟠 원 크기·색은 지역별 찜 합계예요 - 눌러보면 그 지역 랭킹으로 이동해요. 더 확대하면 개별 장소
        마커로 바뀌고, 🔥 임계값 이상 찜된 곳은 금색으로 표시돼요.
      </p>
    </main>
  );
}
