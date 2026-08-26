import type { HTMLAttributes } from "react";
import { Badge } from "@/components/ui/Badge";
import { StarRating } from "@/components/ui/StarRating";
import { SOURCE_META } from "@/lib/constants";
import type { Entry } from "@/lib/types";

interface EntryCardProps {
  entry: Entry;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
}

export function EntryCard({ entry, dragHandleProps }: EntryCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4">
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
          <p className="font-medium text-stone-900">{entry.placeName}</p>
          <Badge color={SOURCE_META[entry.source].color} textColor={SOURCE_META[entry.source].textColor}>
            {SOURCE_META[entry.source].label}
          </Badge>
        </div>
        {entry.address && <p className="mt-0.5 text-sm text-stone-500">{entry.address}</p>}
        {entry.memo && <p className="mt-2 text-sm text-stone-700">{entry.memo}</p>}
        <div className="mt-2 flex items-center justify-between">
          {entry.stars ? <StarRating value={entry.stars} readOnly /> : <span />}
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
  );
}
