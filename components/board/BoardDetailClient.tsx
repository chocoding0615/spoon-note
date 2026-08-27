"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BoardHeader } from "./BoardHeader";
import { MapViewLoader } from "./MapViewLoader";
import { RankableEntryList } from "@/components/entry/RankableEntryList";
import { AddEntryDialog, type AddEntryInput } from "@/components/entry/AddEntryDialog";
import { CollectModal } from "@/components/collect/CollectModal";
import { Button } from "@/components/ui/Button";
import { OWNER_KEY_HEADER } from "@/lib/constants";
import type { Board, CollectiblePlace, Entry } from "@/lib/types";

function toCollectiblePlace(entry: Entry): CollectiblePlace {
  return {
    source: entry.source,
    placeName: entry.placeName,
    address: entry.address,
    lat: entry.lat,
    lng: entry.lng,
    category: entry.category,
    photos: entry.photos,
    sourceUrl: entry.sourceUrl,
    canonicalId: entry.canonicalId,
  };
}

type ViewMode = "list" | "map";

interface BoardDetailClientProps {
  board: Board;
  initialEntries: Entry[];
  /** canonicalId -> 커뮤니티 찜 횟수. 서버(page.tsx)에서 한 번에 조회해 내려준다 -
   *  이 화면 안에서 새로 추가한 엔트리는 다음 새로고침 전까지 뱃지가 안 붙는다(알려진 한계). */
  saveCounts: Record<string, number>;
  isOwner: boolean;
  ownerKey?: string;
  initialView: ViewMode;
}

export function BoardDetailClient({
  board: initialBoard,
  initialEntries,
  saveCounts,
  isOwner,
  ownerKey,
  initialView,
}: BoardDetailClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<ViewMode>(initialView);
  const [board, setBoard] = useState(initialBoard);
  const [entries, setEntries] = useState(initialEntries);
  // 마지막으로 서버에 저장된 순서 - dirty 판정 기준(순서 저장 버튼 노출 여부)
  const [savedOrderIds, setSavedOrderIds] = useState(initialEntries.map((entry) => entry.id));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [collectPlace, setCollectPlace] = useState<CollectiblePlace | null>(null);
  const dirty = JSON.stringify(entries.map((entry) => entry.id)) !== JSON.stringify(savedOrderIds);

  function handleViewChange(next: ViewMode) {
    setView(next);
    const params = new URLSearchParams(window.location.search);
    params.set("view", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function postEntry(input: AddEntryInput): Promise<{ ok: true; entry: Entry } | { ok: false; error?: string }> {
    const res = await fetch(`/api/boards/${board.slug}/entries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ownerKey ? { [OWNER_KEY_HEADER]: ownerKey } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { ok: false, error: data?.error };
    }
    const data = await res.json();
    return { ok: true, entry: data.entry as Entry };
  }

  async function handleAddEntry(input: AddEntryInput): Promise<{ ok: boolean; error?: string }> {
    const result = await postEntry(input);
    if (!result.ok) return { ok: false, error: result.error };
    setEntries((prev) => [...prev, result.entry]);
    return { ok: true };
  }

  // 폴더 링크 가져오기(placelist import)의 "선택한 장소 추가"가 쓴다 - 기존
  // 장소 추가 로직(postEntry)을 그대로 재사용하면서, 몇 개까지 성공했는지/어디서
  // 멈췄는지(예: freeEntriesPerBoard 상한)를 호출부(ImportListPreview)에 알려준다.
  async function handleAddManyEntries(inputs: AddEntryInput[]): Promise<{ addedCount: number; error?: string }> {
    let addedCount = 0;
    for (const input of inputs) {
      const result = await postEntry(input);
      if (!result.ok) return { addedCount, error: result.error };
      setEntries((prev) => [...prev, result.entry]);
      addedCount++;
    }
    return { addedCount };
  }

  async function handleSaveOrder() {
    if (!ownerKey) return;
    const orderedIds = entries.map((entry) => entry.id);
    const res = await fetch(`/api/boards/${board.slug}/entries`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", [OWNER_KEY_HEADER]: ownerKey },
      body: JSON.stringify({ orderedIds }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      // savedOrderIds를 안 건드려서 dirty가 유지되게 한다 - 저장 버튼이 그대로
      // 남아있어야 사용자가 실패를 알고 다시 시도할 수 있다.
      throw new Error(data?.error ?? "순서를 저장하지 못했어요.");
    }
    setSavedOrderIds(orderedIds);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <BoardHeader
        board={board}
        entryCount={entries.length}
        isOwner={isOwner}
        ownerKey={ownerKey}
        onBoardUpdated={setBoard}
      />

      <div className="flex items-center gap-2">
        <Button variant={view === "list" ? "primary" : "ghost"} onClick={() => handleViewChange("list")}>
          리스트
        </Button>
        <Button variant={view === "map" ? "primary" : "ghost"} onClick={() => handleViewChange("map")}>
          지도
        </Button>
        <div className="flex-1" />
        <Button onClick={() => setDialogOpen(true)}>+ 장소 추가</Button>
      </div>

      {view === "map" ? (
        <MapViewLoader entries={entries} saveCounts={saveCounts} />
      ) : (
        <RankableEntryList
          entries={entries}
          editable={isOwner}
          dirty={dirty}
          saveCounts={saveCounts}
          onReorder={setEntries}
          onSaveOrder={handleSaveOrder}
          onCollect={board.visibility === "community" ? (entry) => setCollectPlace(toCollectiblePlace(entry)) : undefined}
        />
      )}

      <AddEntryDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onAdd={handleAddEntry}
        boardSlug={board.slug}
        ownerKey={ownerKey}
        onAddMany={handleAddManyEntries}
      />

      {collectPlace && <CollectModal place={collectPlace} onClose={() => setCollectPlace(null)} />}
    </main>
  );
}
