"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { VISIBILITY_OPTIONS } from "@/lib/constants";
import type { Board } from "@/lib/types";

interface BoardHeaderProps {
  board: Board;
  entryCount: number;
}

export function BoardHeader({ board, entryCount }: BoardHeaderProps) {
  const [copied, setCopied] = useState(false);
  const visibilityLabel = VISIBILITY_OPTIONS.find((option) => option.value === board.visibility)?.label;

  async function handleShare() {
    // ownerKey 쿼리는 나만 볼 수 있는 값이니 공유 링크에서는 빼고 보낸다.
    const url = window.location.href.split("?")[0];

    if (navigator.share) {
      try {
        await navigator.share({ title: board.title, url });
      } catch {
        // 사용자가 공유를 취소한 경우 등 - 조용히 무시(클립보드 폴백으로 넘어가지 않음)
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 접근 실패 - 공유는 필수 기능이 아니므로 조용히 무시
    }
  }

  return (
    <div className="flex flex-col gap-3 border-b border-stone-200 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{board.title}</h1>
          {board.description && <p className="mt-1 text-sm text-stone-500">{board.description}</p>}
        </div>
        <Button variant="secondary" onClick={handleShare}>
          {copied ? "복사됨!" : "공유하기"}
        </Button>
      </div>
      <div className="flex items-center gap-2 text-xs text-stone-400">
        <span className="rounded-full bg-stone-100 px-2 py-0.5">{visibilityLabel}</span>
        <span>장소 {entryCount}개</span>
      </div>
    </div>
  );
}
