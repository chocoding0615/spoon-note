"use client";

import { useState } from "react";
import { EntryCard } from "./EntryCard";
import { Button } from "@/components/ui/Button";
import type { Entry } from "@/lib/types";

interface RankableEntryListProps {
  entries: Entry[];
  /** ownerKey 보유 시(§5-4)에만 드래그 정렬을 허용한다. */
  editable: boolean;
  /** 마지막 저장 이후 순서가 바뀌었는지 - 저장 버튼 노출 여부를 부모가 판정해서 내려준다. */
  dirty: boolean;
  /** 드롭 시점마다 호출 - 부모가 setEntries 한다(이 컴포넌트는 데이터를 소유하지 않음). */
  onReorder: (next: Entry[]) => void;
  /** 저장 버튼 클릭 - 부모가 PATCH하고 저장 완료 상태를 갱신한다. */
  onSaveOrder: () => Promise<void>;
}

// 드래그 라이브러리는 번들이 가벼운 쪽을 우선한다는 원칙에 따라, 별도 패키지 없이
// 네이티브 HTML5 드래그&드롭 이벤트로 구현했다.
//
// entries를 내부 state로 복사하지 않고 그대로 렌더한다 - 예전엔 useState(entries)로
// 1회 복사했는데, 부모가 장소를 추가해도 이 복사본은 안 늘어나서 리스트 뷰에 머문
// 채로는 새 항목이 안 보이는 버그가 있었다(지도 탭 갔다 와야 remount되어 보임).
// dragIndex/saving처럼 서버에 저장되지 않는 순수 UI 상태만 내부에 둔다.
export function RankableEntryList({ entries, editable, dirty, onReorder, onSaveOrder }: RankableEntryListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  if (entries.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-stone-200 text-sm text-stone-400">
        아직 담긴 장소가 없어요
      </div>
    );
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = [...entries];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    onReorder(next);
    setDragIndex(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSaveOrder();
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
      {entries.map((entry, index) => (
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
