"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { LAST_REGION_STORAGE_KEY } from "@/lib/constants";
import { haversineDistanceMeters } from "@/lib/utils/geo";
import type { RegionCentroid } from "@/lib/types";

interface RegionPickerProps {
  regions: string[];
  value: string;
  /** page.tsx가 ?region 없이 regions[0]으로 기본값을 채운 건지 여부 - true일
   *  때만 localStorage에 저장된 "마지막으로 본 지역"으로 조용히 대체한다
   *  (사용자가 명시적으로 고른 URL을 덮어쓰면 안 되므로). */
  hasExplicitRegion: boolean;
  centroids: RegionCentroid[];
}

// 상단 지역 선택(§프롬프트 10 홈 탭) - RegionSelect(커뮤니티/랭킹 페이지용)와
// 비슷하지만, "마지막으로 본 지역" 기억과 "현재 위치로 찾기"가 추가로 필요해서
// 별도 컴포넌트로 뒀다(재사용하려면 그쪽에 이 둘을 얹어야 해서 오히려 더 복잡해짐).
export function RegionPicker({ regions, value, hasExplicitRegion, centroids }: RegionPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);

  useEffect(() => {
    if (!hasExplicitRegion) {
      const saved = window.localStorage.getItem(LAST_REGION_STORAGE_KEY);
      if (saved && saved !== value && regions.includes(saved)) {
        router.replace(`${pathname}?region=${encodeURIComponent(saved)}`, { scroll: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 최초 마운트 시 한 번만 확인하면 됨
  }, []);

  function goToRegion(region: string) {
    window.localStorage.setItem(LAST_REGION_STORAGE_KEY, region);
    router.push(`${pathname}?region=${encodeURIComponent(region)}`, { scroll: false });
  }

  function handleLocate() {
    if (!navigator.geolocation || centroids.length === 0) {
      setLocateError(true);
      return;
    }
    setLocating(true);
    setLocateError(false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const here = { lat: position.coords.latitude, lng: position.coords.longitude };
        const nearest = centroids.reduce((best, candidate) =>
          haversineDistanceMeters(here, candidate) < haversineDistanceMeters(here, best) ? candidate : best
        );
        goToRegion(nearest.region);
      },
      () => {
        setLocating(false);
        setLocateError(true);
      },
      { timeout: 5000 }
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        options={regions.map((region) => ({ value: region, label: region }))}
        value={value}
        onChange={(event) => goToRegion(event.target.value)}
        className="w-auto min-w-[7rem]"
      />
      <button
        type="button"
        onClick={handleLocate}
        disabled={locating}
        className="whitespace-nowrap rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-60"
      >
        {locating ? "찾는 중..." : "📍 현재 위치"}
      </button>
      {locateError && <span className="text-xs text-red-500">위치를 확인할 수 없어요</span>}
    </div>
  );
}
