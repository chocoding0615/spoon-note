"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { FeedBoardCard } from "@/lib/types";

interface FeedCardProps {
  card: FeedBoardCard;
}

// 카드 전체는 보드 상세로 이동하는 Link지만, 신고 버튼만은 별개 동작이어야 해서
// Link 안에 button을 중첩하는(비표준) 대신 카드 위에 절대위치로 올린 형제 요소로 뺐다.
export function FeedCard({ card }: FeedCardProps) {
  const [reportState, setReportState] = useState<"idle" | "sending" | "done" | "error">("idle");

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
            {card.popularCount > 0 && (
              <p className="text-xs font-medium text-amber-600">
                🔥 이 중 {card.popularCount}곳은 다른 사람도 찜했어요
              </p>
            )}
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
