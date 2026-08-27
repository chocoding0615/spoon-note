"use client";

import dynamic from "next/dynamic";
import type { MapPlace, RegionDensity } from "@/lib/types";

// leaflet은 window에 의존하므로 SSR 없이 클라이언트에서만 로드한다(§MapViewLoader.tsx와 동일 패턴).
const DensityMapView = dynamic(() => import("./DensityMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[28rem] items-center justify-center rounded-2xl border border-stone-100 bg-stone-50 text-sm text-stone-400">
      지도를 불러오는 중...
    </div>
  ),
});

export function DensityMapViewLoader({ densities, places }: { densities: RegionDensity[]; places: MapPlace[] }) {
  return <DensityMapView densities={densities} places={places} />;
}
