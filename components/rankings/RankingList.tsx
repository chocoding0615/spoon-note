"use client";

import { useState } from "react";
import Link from "next/link";
import type { CanonicalPlaceRanking, PlaceBoardSummary } from "@/lib/types";

interface RankingListProps {
  places: CanonicalPlaceRanking[];
}

const MEDALS = ["🥇", "🥈", "🥉"] as const;

// 항목을 펼칠 때만 "이 장소를 찜한 보드" 목록을 지연 조회한다(§api/canonical-places/[id]/boards) -
// 한 번 불러온 뒤엔 boardsById에 캐시해서 접었다 펴도 다시 요청하지 않는다.
export function RankingList({ places }: RankingListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [boardsById, setBoardsById] = useState<Record<string, PlaceBoardSummary[] | "loading" | "error">>({});

  async function handleToggle(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (boardsById[id]) return;

    setBoardsById((prev) => ({ ...prev, [id]: "loading" }));
    try {
      const res = await fetch(`/api/canonical-places/${id}/boards`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBoardsById((prev) => ({ ...prev, [id]: data.boards ?? [] }));
    } catch {
      setBoardsById((prev) => ({ ...prev, [id]: "error" }));
    }
  }

  if (places.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-stone-200 text-sm text-stone-400">
        이 지역엔 아직 커뮤니티에 찜된 장소가 없어요
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {places.map((place, index) => {
        const rank = index + 1;
        const medal = MEDALS[index];
        const expanded = expandedId === place.id;
        const boards = boardsById[place.id];

        return (
          <div key={place.id} className="rounded-2xl border border-stone-200 bg-white">
            <button
              type="button"
              onClick={() => handleToggle(place.id)}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <span className="w-8 shrink-0 text-center text-lg">{medal ?? rank}</span>
              <span className="flex-1 font-medium text-stone-900">{place.placeName}</span>
              <span className="shrink-0 text-sm text-stone-500">🔥 {place.saveCount}곳</span>
            </button>
            {expanded && (
              <div className="border-t border-stone-100 px-4 py-3">
                {boards === "loading" && <p className="text-sm text-stone-400">불러오는 중...</p>}
                {boards === "error" && <p className="text-sm text-red-500">불러오지 못했어요.</p>}
                {Array.isArray(boards) && boards.length === 0 && (
                  <p className="text-sm text-stone-400">연결된 보드를 찾을 수 없어요.</p>
                )}
                {Array.isArray(boards) && boards.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {boards.map((board) => (
                      <li key={board.slug}>
                        <Link href={`/b/${board.slug}`} className="text-sm text-accent hover:underline">
                          {board.title} <span className="text-stone-400">· {board.authorName}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
