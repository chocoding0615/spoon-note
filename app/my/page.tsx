"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BoardCard } from "@/components/board/BoardCard";
import { useOwnedBoards } from "@/lib/utils/ownerKey";
import type { Board } from "@/lib/types";

export default function MyBoardsPage() {
  const owned = useOwnedBoards();
  const ownerKeyBySlug = Object.fromEntries(owned.map(({ slug, ownerKey }) => [slug, ownerKey]));
  const ownerKeysParam = owned.map(({ ownerKey }) => ownerKey).join(",");

  const [boards, setBoards] = useState<Board[]>([]);
  const [hasFetched, setHasFetched] = useState(false);
  const loading = Boolean(ownerKeysParam) && !hasFetched;

  useEffect(() => {
    if (!ownerKeysParam) return; // 소유한 보드가 없으면 fetch 자체가 필요 없다

    fetch(`/api/boards?ownerKeys=${encodeURIComponent(ownerKeysParam)}`)
      .then((res) => res.json())
      .then((data) => setBoards(data.boards ?? []))
      .finally(() => setHasFetched(true));
  }, [ownerKeysParam]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">내 보드</h1>
        <Link href="/boards/new" className="text-sm font-medium text-accent">
          + 새 보드
        </Link>
      </div>

      {loading && <p className="text-sm text-stone-400">불러오는 중...</p>}
      {!loading && boards.length === 0 && <p className="text-sm text-stone-400">아직 만든 보드가 없어요.</p>}

      <div className="flex flex-col gap-3">
        {boards.map((board) => (
          <BoardCard
            key={board.slug}
            board={board}
            href={`/b/${board.slug}?ownerKey=${ownerKeyBySlug[board.slug] ?? ""}`}
          />
        ))}
      </div>
    </main>
  );
}
