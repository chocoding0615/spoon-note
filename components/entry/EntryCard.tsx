import type { HTMLAttributes } from "react";
import { Badge } from "@/components/ui/Badge";
import { StarRating } from "@/components/ui/StarRating";
import { COMMUNITY, SOURCE_META } from "@/lib/constants";
import type { Entry } from "@/lib/types";

interface EntryCardProps {
  entry: Entry;
  /** 이 장소의 커뮤니티 찜 횟수. 0이거나 매칭 데이터가 없으면 뱃지를 안 보여준다. */
  saveCount?: number;
  /** 주어질 때만 "담아가기" 버튼을 보여준다 - 부모(BoardDetailClient)가 보드가
   *  "커뮤니티공개"일 때만 이 prop을 넘긴다(프롬프트 8). */
  onCollect?: () => void;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
}

export function EntryCard({ entry, saveCount = 0, onCollect, dragHandleProps }: EntryCardProps) {
  const gold = saveCount >= COMMUNITY.goldThreshold;
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-4 ${
        gold ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"
      }`}
    >
      {dragHandleProps && (
        <button
          type="button"
          className="mt-1 cursor-grab select-none text-stone-300 active:cursor-grabbing"
          {...dragHandleProps}
        >
          ⠿
        </button>
      )}
      <div className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`font-medium ${gold ? "text-amber-700" : "text-stone-900"}`}>{entry.placeName}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            {saveCount > 0 && (
              <Badge color={gold ? "#eab308" : "#78716c"} textColor="#ffffff">
                🔥 {saveCount}
              </Badge>
            )}
            <Badge color={SOURCE_META[entry.source].color} textColor={SOURCE_META[entry.source].textColor}>
              {SOURCE_META[entry.source].label}
            </Badge>
          </div>
        </div>
        {entry.address && <p className="mt-0.5 text-sm text-stone-500">{entry.address}</p>}
        {entry.memo && <p className="mt-2 text-sm text-stone-700">{entry.memo}</p>}
        <div className="mt-2 flex items-center justify-between gap-2">
          {entry.stars ? <StarRating value={entry.stars} readOnly /> : <span />}
          <div className="flex items-center gap-3">
            {onCollect && (
              <button
                type="button"
                onClick={onCollect}
                className="text-xs font-medium text-accent hover:underline"
              >
                담아가기
              </button>
            )}
            {entry.sourceUrl && (
              <a
                href={entry.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-stone-400 underline hover:text-stone-600"
              >
                원본 링크
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
