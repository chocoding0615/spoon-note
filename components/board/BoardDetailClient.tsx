"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BoardHeader } from "./BoardHeader";
import { MapViewLoader } from "./MapViewLoader";
import { RankableEntryList } from "@/components/entry/RankableEntryList";
import { AddEntryDialog, type AddEntryInput } from "@/components/entry/AddEntryDialog";
import { Button } from "@/components/ui/Button";
import { OWNER_KEY_HEADER } from "@/lib/constants";
import type { Board, Entry } from "@/lib/types";

type ViewMode = "list" | "map";

interface BoardDetailClientProps {
  board: Board;
  initialEntries: Entry[];
  isOwner: boolean;
  ownerKey?: string;
  initialView: ViewMode;
}

export function BoardDetailClient({
  board,
  initialEntries,
  isOwner,
  ownerKey,
  initialView,
}: BoardDetailClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<ViewMode>(initialView);
  const [entries, setEntries] = useState(initialEntries);
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleViewChange(next: ViewMode) {
    setView(next);
    const params = new URLSearchParams(window.location.search);
    params.set("view", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function handleAddEntry(input: AddEntryInput) {
    const res = await fetch(`/api/boards/${board.slug}/entries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ownerKey ? { [OWNER_KEY_HEADER]: ownerKey } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) return;
    const data = await res.json();
    setEntries((prev) => [...prev, data.entry as Entry]);
  }

  async function handleSaveOrder(orderedIds: string[]) {
    if (!ownerKey) return;
    await fetch(`/api/boards/${board.slug}/entries`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", [OWNER_KEY_HEADER]: ownerKey },
      body: JSON.stringify({ orderedIds }),
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <BoardHeader board={board} entryCount={entries.length} />

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
        <MapViewLoader entries={entries} />
      ) : (
        <RankableEntryList entries={entries} editable={isOwner} onSaveOrder={handleSaveOrder} />
      )}

      <AddEntryDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onAdd={handleAddEntry} />
    </main>
  );
}
