"use client";

import { useState } from "react";
import { EntryCard } from "./EntryCard";
import { Button } from "@/components/ui/Button";
import type { Entry } from "@/lib/types";

interface RankableEntryListProps {
  entries: Entry[];
  /** ownerKey 보유 시(§5-4)에만 드래그 정렬을 허용한다. */
  editable: boolean;
  onSaveOrder: (orderedIds: string[]) => Promise<void>;
}

// 드래그 라이브러리는 번들이 가벼운 쪽을 우선한다는 원칙에 따라, 별도 패키지 없이
// 네이티브 HTML5 드래그&드롭 이벤트로 구현했다.
export function RankableEntryList({ entries, editable, onSaveOrder }: RankableEntryListProps) {
  const [order, setOrder] = useState(entries);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  if (order.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-stone-200 text-sm text-stone-400">
        아직 담긴 장소가 없어요
      </div>
    );
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSaveOrder(order.map((entry) => entry.id).filter((id): id is string => Boolean(id)));
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {editable && dirty && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "저장 중..." : "순서 저장"}
          </Button>
        </div>
      )}
      {order.map((entry, index) => (
        <div
          key={entry.id}
          draggable={editable}
          onDragStart={() => setDragIndex(index)}
          onDragOver={(event) => editable && event.preventDefault()}
          onDrop={() => handleDrop(index)}
        >
          <EntryCard entry={entry} dragHandleProps={editable ? {} : undefined} />
        </div>
      ))}
    </div>
  );
}
