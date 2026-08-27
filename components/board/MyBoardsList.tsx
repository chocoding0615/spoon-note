"use client";

import { useEffect, useMemo, useState } from "react";
import { BoardCard } from "./BoardCard";
import { useOwnedBoards } from "@/lib/utils/ownerKey";
import type { Board } from "@/lib/types";

interface MyBoardsListProps {
  /** 로그인 상태면 서버(userId 기준)에서 이미 조회해 내려준 보드들 - 다른
   *  기기에서도 로그인만 하면 보인다(§계정 설계안 03). */
  accountBoards: Board[];
}

// 계정 연결 보드(서버, userId 기준)와 이 브라우저에 남아있는 ownerKey 보드
// (localStorage)를 합쳐서 하나의 "내 보드" 목록으로 보여준다 - 이미 계정에
// 연결된 보드도 로컬에 ownerKey가 남아있을 수 있어서 slug 기준으로 중복 제거.
export function MyBoardsList({ accountBoards }: MyBoardsListProps) {
  const owned = useOwnedBoards();
  const ownerKeysParam = owned.map(({ ownerKey }) => ownerKey).join(",");

  const [localBoards, setLocalBoards] = useState<Board[]>([]);
  const [hasFetched, setHasFetched] = useState(false);
  const loading = Boolean(ownerKeysParam) && !hasFetched;

  useEffect(() => {
    if (!ownerKeysParam) return; // 소유한 보드가 없으면 fetch 자체가 필요 없다
    fetch(`/api/boards?ownerKeys=${encodeURIComponent(ownerKeysParam)}`)
      .then((res) => res.json())
      .then((data) => setLocalBoards(data.boards ?? []))
      .finally(() => setHasFetched(true));
  }, [ownerKeysParam]);

  const boards = useMemo(() => {
    const bySlug = new Map<string, Board>();
    for (const board of accountBoards) bySlug.set(board.slug, board);
    for (const board of localBoards) if (!bySlug.has(board.slug)) bySlug.set(board.slug, board);
    return Array.from(bySlug.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [accountBoards, localBoards]);

  if (loading) return <p className="text-sm text-stone-400">불러오는 중...</p>;
  if (boards.length === 0) return <p className="text-sm text-stone-400">아직 만든 보드가 없어요.</p>;

  return (
    <div className="flex flex-col gap-3">
      {boards.map((board) => (
        <BoardCard key={board.slug} board={board} href={`/b/${board.slug}?ownerKey=${board.ownerKey}`} />
      ))}
    </div>
  );
}
