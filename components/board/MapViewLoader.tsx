"use client";

import dynamic from "next/dynamic";
import type { Entry } from "@/lib/types";

// leaflet은 window에 의존하므로 SSR 없이 클라이언트에서만 로드한다.
// ssr:false는 Client Component 안에서만 허용되기 때문에 이 파일이 그 경계를 담당한다.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center rounded-2xl border border-stone-100 bg-stone-50 text-sm text-stone-400">
      지도를 불러오는 중...
    </div>
  ),
});

export function MapViewLoader({ entries, saveCounts }: { entries: Entry[]; saveCounts: Record<string, number> }) {
  return <MapView entries={entries} saveCounts={saveCounts} />;
}
