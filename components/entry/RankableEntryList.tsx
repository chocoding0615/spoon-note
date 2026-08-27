"use client";

import { useState } from "react";
import { EntryCard } from "./EntryCard";
import { Button } from "@/components/ui/Button";
import type { Entry } from "@/lib/types";

interface RankableEntryListProps {
  entries: Entry[];
  /** ownerKey 보유 시(§5-4)에만 드래그 정렬을 허용한다. */
  editable: boolean;
  /** 마지막으로 서버에 저장된 순서와 다른지 - 저장 버튼 노출 여부를 부모가 판정해서 내려준다. */
  dirty: boolean;
  /** canonicalId -> 커뮤니티 찜 횟수. 뱃지 표시 및 "인기순 보기" 정렬에 쓴다. */
  saveCounts: Record<string, number>;
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
export function RankableEntryList({
  entries,
  editable,
  dirty,
  saveCounts,
  onReorder,
  onSaveOrder,
}: RankableEntryListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // 화면에 보여줄 순서만 임시로 바꾸는 뷰 상태 - onReorder를 호출하지 않으므로
  // entries(=사용자가 드래그로 저장한 실제 순서)는 건드리지 않는다.
  const [popularFirst, setPopularFirst] = useState(false);

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
    setSaveError("");
    try {
      await onSaveOrder();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "순서를 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  // 인기순 정렬은 렌더링용 임시 배열이다 - 드래그는 popularFirst일 때 꺼서(dragEnabled)
  // "저장된 순서를 보면서 드래그" 전제가 깨지지 않게 한다.
  const displayEntries = popularFirst
    ? [...entries].sort((a, b) => {
        const countA = a.canonicalId ? (saveCounts[a.canonicalId] ?? 0) : 0;
        const countB = b.canonicalId ? (saveCounts[b.canonicalId] ?? 0) : 0;
        return countB - countA;
      })
    : entries;
  const dragEnabled = editable && !popularFirst;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={popularFirst}
            onChange={(event) => setPopularFirst(event.target.checked)}
            className="h-4 w-4 rounded border-stone-300"
          />
          인기순 보기
        </label>
        {dragEnabled && dirty && (
          <div className="flex items-center gap-3">
            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "저장 중..." : "순서 저장"}
            </Button>
          </div>
        )}
      </div>
      {displayEntries.map((entry, index) => (
        <div
          key={entry.id}
          draggable={dragEnabled}
          onDragStart={() => setDragIndex(index)}
          onDragOver={(event) => dragEnabled && event.preventDefault()}
          onDrop={() => handleDrop(index)}
        >
          <EntryCard
            entry={entry}
            saveCount={entry.canonicalId ? (saveCounts[entry.canonicalId] ?? 0) : 0}
            dragHandleProps={dragEnabled ? {} : undefined}
          />
        </div>
      ))}
    </div>
  );
}
