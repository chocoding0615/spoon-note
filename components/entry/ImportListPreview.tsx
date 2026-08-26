"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { LIMITS, OWNER_KEY_HEADER } from "@/lib/constants";
import type { ImportListResponse, ImportListPlace } from "@/lib/types";
import type { AddEntryInput } from "./AddEntryDialog";

interface AddManyResult {
  addedCount: number;
  error?: string;
}

interface ImportListPreviewProps {
  boardSlug: string;
  ownerKey?: string;
  url: string;
  initialResult: ImportListResponse;
  onAddSelected: (inputs: AddEntryInput[]) => Promise<AddManyResult>;
  onDone: () => void;
  onCancel: () => void;
}

function toAddEntryInput(place: ImportListPlace): AddEntryInput {
  return {
    source: place.source,
    placeName: place.placeName,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    category: place.category,
    sourceUrl: place.sourceUrl,
  };
}

// "폴더 링크로 여러 개 한번에 가져오기" 미리보기 - AddEntryDialog가 PasteBox에서
// isPlacelist:true를 받으면 기존 단일 장소 폼 대신 이 컴포넌트를 보여준다.
// 재시도(retry)는 이 컴포넌트가 직접 같은 url로 import-list를 다시 호출해서
// 처리한다 - PasteBox는 이미 url을 비운 상태라 부모까지 안 거치고 여기서 끝냄.
export function ImportListPreview({
  boardSlug,
  ownerKey,
  url,
  initialResult,
  onAddSelected,
  onDone,
  onCancel,
}: ImportListPreviewProps) {
  const [result, setResult] = useState(initialResult);
  const [retrying, setRetrying] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set((initialResult.places ?? []).flatMap((place, i) => (place.isDuplicate ? [] : [i])))
  );
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | undefined>(undefined);

  const places = result.places ?? [];
  const allSelected = places.length > 0 && selected.size === places.length;

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/boards/${boardSlug}/import-list`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ownerKey ? { [OWNER_KEY_HEADER]: ownerKey } : {}),
        },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json().catch(() => null)) as ImportListResponse | null;
      if (data?.isPlacelist) {
        setResult(data);
        setSelected(new Set((data.places ?? []).flatMap((place, i) => (place.isDuplicate ? [] : [i]))));
      }
    } finally {
      setRetrying(false);
    }
  }

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(places.map((_, i) => i)));
  }

  async function handleAdd() {
    if (selected.size === 0 || adding) return;
    setAdding(true);
    setAddError(undefined);
    try {
      const inputs = places.filter((_, i) => selected.has(i)).map(toAddEntryInput);
      const outcome = await onAddSelected(inputs);
      if (outcome.error) {
        setAddError(`${outcome.addedCount}개 추가 후 멈췄어요: ${outcome.error}`);
      } else {
        onDone();
      }
    } finally {
      setAdding(false);
    }
  }

  if (result.error && places.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-600">{result.error}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <Button variant="secondary" onClick={handleRetry} disabled={retrying}>
            {retrying ? <Spinner /> : "다시 시도"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-stone-500">
        <span>
          {result.truncated
            ? `총 ${result.totalCount}개 중 ${LIMITS.importListMax}개까지 가져왔어요`
            : `${result.importedCount ?? places.length}개 장소를 찾았어요`}
        </span>
        <button type="button" onClick={toggleAll} className="font-medium text-accent hover:underline">
          {allSelected ? "전체 해제" : "전체 선택"}
        </button>
      </div>

      {result.partial && (
        <p className="text-xs text-amber-600">
          일부만 가져왔어요(중간에 오류가 있었어요).{" "}
          <button type="button" onClick={handleRetry} className="underline" disabled={retrying}>
            다시 시도
          </button>
        </p>
      )}

      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {places.map((place, index) => (
          <label
            key={`${place.sourceUrl}-${index}`}
            className={`flex items-center gap-3 rounded-xl border p-2.5 ${
              place.isDuplicate ? "border-stone-100 bg-stone-50" : "border-stone-200 bg-white"
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(index)}
              onChange={() => toggle(index)}
              className="h-4 w-4 shrink-0 accent-orange-500"
            />
            {place.photos?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element -- 외부 도메인 썸네일이라 next/image 최적화 대상이 아님
              <img src={place.photos[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-lg">
                📍
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-medium text-stone-900">{place.placeName}</p>
                {place.isDuplicate && (
                  <Badge color="#e7e5e4" textColor="#78716c" className="shrink-0">
                    이미 담김
                  </Badge>
                )}
              </div>
              {place.address && <p className="truncate text-xs text-stone-500">{place.address}</p>}
            </div>
            {place.category && <span className="shrink-0 text-xs text-stone-400">{place.category}</span>}
          </label>
        ))}
      </div>

      {addError && <p className="text-sm text-red-500">{addError}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={adding}>
          취소
        </Button>
        <Button onClick={handleAdd} disabled={selected.size === 0 || adding}>
          {adding ? "추가하는 중..." : `선택한 장소 추가 (${selected.size}개)`}
        </Button>
      </div>
    </div>
  );
}
