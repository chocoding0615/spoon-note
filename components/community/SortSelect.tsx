"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { FEED_SORT_OPTIONS } from "@/lib/constants";
import type { FeedSort } from "@/lib/types";

interface SortSelectProps {
  value: FeedSort;
  /** RegionSelect와 같은 패턴 - 같은 화면의 다른 컨트롤(지역 필터)이 쓰는 쿼리
   *  파라미터를 유지한 채 sort(+거리순의 lat/lng)만 바꾼다. */
  preserveParams?: Record<string, string>;
}

// "거리순"을 고르면 브라우저 위치 권한을 요청해서 lat/lng도 같이 URL에 실어
// 서버(feedService.listCommunityFeed)가 실제 거리 계산을 하게 한다. 권한을
// 거부하거나 위치를 못 가져와도 sort=distance 자체는 반영한다 - 서버 쪽이
// origin 없는 거리순을 "최신순"으로 폴백 처리한다(§feedService.sortCards).
export function SortSelect({ value, preserveParams }: SortSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [locating, setLocating] = useState(false);

  function navigate(next: FeedSort, coords?: { lat: number; lng: number }) {
    const params = new URLSearchParams(preserveParams);
    params.set("sort", next);
    if (coords) {
      params.set("lat", String(coords.lat));
      params.set("lng", String(coords.lng));
    } else {
      params.delete("lat");
      params.delete("lng");
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleChange(next: string) {
    const sort = next as FeedSort;
    if (sort !== "distance" || !navigator.geolocation) {
      navigate(sort);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        navigate(sort, { lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        setLocating(false);
        navigate(sort); // 권한 거부/실패 - 위치 없이 진행(서버가 최신순으로 폴백)
      },
      { timeout: 5000 }
    );
  }

  return (
    <Select
      options={FEED_SORT_OPTIONS}
      value={value}
      disabled={locating}
      onChange={(event) => handleChange(event.target.value)}
      className="w-auto min-w-[8rem]"
    />
  );
}
