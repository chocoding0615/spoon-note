"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { haversineDistanceMeters } from "@/lib/utils/geo";
import type { FeedBoardCard, FeedSort } from "@/lib/types";

interface FeedCardProps {
  card: FeedBoardCard;
  sort?: FeedSort;
  origin?: { lat: number; lng: number };
}

/** 정렬 기준에 맞는 근거 한 줄을 보여준다(§프롬프트 10) - 왜 이 순서인지 바로
 *  보이게. 해당 정렬의 값이 0/거리 미상이면 기존 "인기 장소" 배지로 폴백한다. */
function sortHighlight(card: FeedBoardCard, sort?: FeedSort, origin?: { lat: number; lng: number }): string | null {
  if (sort === "popular" && card.totalSaveCount > 0) {
    return `🔥 이 보드 장소들의 찜 합계 ${card.totalSaveCount}회`;
  }
  if (sort === "collected" && card.collectedCount > 0) {
    return `🧺 다른 사람이 담아간 횟수 ${card.collectedCount}회`;
  }
  if (sort === "distance" && origin && card.lat !== null && card.lng !== null) {
    const meters = haversineDistanceMeters(origin, { lat: card.lat, lng: card.lng });
    const label = meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
    return `📍 약 ${label} 거리`;
  }
  if (card.popularCount > 0) {
    return `🔥 이 중 ${card.popularCount}곳은 다른 사람도 찜했어요`;
  }
  return null;
}

// 카드 전체는 보드 상세로 이동하는 Link지만, 신고 버튼만은 별개 동작이어야 해서
// Link 안에 button을 중첩하는(비표준) 대신 카드 위에 절대위치로 올린 형제 요소로 뺐다.
export function FeedCard({ card, sort, origin }: FeedCardProps) {
  const [reportState, setReportState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const highlight = sortHighlight(card, sort, origin);

  async function handleReport() {
    if (reportState === "sending" || reportState === "done") return;
    if (!window.confirm("이 보드를 신고하시겠어요?")) return;

    setReportState("sending");
    try {
      const res = await fetch(`/api/boards/${card.slug}/report`, { method: "POST" });
      if (!res.ok) throw new Error();
      setReportState("done");
    } catch {
      setReportState("error");
    }
  }

  return (
    <div className="relative">
      <Link href={`/b/${card.slug}`}>
        <Card className="overflow-hidden p-0 transition-shadow hover:shadow-md">
          <div className="flex h-40 items-center justify-center bg-stone-100">
            {card.coverPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element -- 외부 도메인 사진이라 next/image 최적화 대상이 아님
              <img src={card.coverPhoto} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl">🥄</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5 p-4">
            <h3 className="font-medium text-stone-900">{card.title}</h3>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
              {card.region && (
                <Badge color="#f5f5f4" textColor="#57534e">
                  {card.region}
                </Badge>
              )}
              <span>장소 {card.entryCount}개</span>
              <span>·</span>
              <span>{card.authorName}</span>
            </div>
            {highlight && <p className="text-xs font-medium text-amber-600">{highlight}</p>}
          </div>
        </Card>
      </Link>
      <button
        type="button"
        onClick={handleReport}
        disabled={reportState === "sending" || reportState === "done"}
        className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs text-stone-500 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
      >
        {reportState === "done" ? "신고 접수됨" : "🚩 신고"}
      </button>
    </div>
  );
}
