"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { StarRating } from "@/components/ui/StarRating";
import { PasteBox } from "@/components/paste/PasteBox";
import { LIMITS } from "@/lib/constants";
import type { Entry, ParsedPlace } from "@/lib/types";

export interface AddEntryInput {
  source: Entry["source"];
  placeName: string;
  address?: string;
  lat?: number;
  lng?: number;
  sourceUrl?: string;
  category?: string;
  memo?: string;
  stars?: Entry["stars"];
}

interface AddEntryDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (input: AddEntryInput) => Promise<void>;
}

export function AddEntryDialog({ open, onClose, onAdd }: AddEntryDialogProps) {
  const [parsed, setParsed] = useState<ParsedPlace | null>(null);
  const [manualName, setManualName] = useState("");
  const [memo, setMemo] = useState("");
  const [stars, setStars] = useState<Entry["stars"]>(undefined);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setParsed(null);
    setManualName("");
    setMemo("");
    setStars(undefined);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    const placeName = (parsed?.placeName ?? manualName).trim();
    if (!placeName || submitting) return;

    setSubmitting(true);
    try {
      await onAdd({
        source: parsed?.source ?? "manual",
        placeName,
        address: parsed?.address,
        lat: parsed?.lat,
        lng: parsed?.lng,
        sourceUrl: parsed?.sourceUrl,
        category: parsed?.category,
        memo: memo.trim() || undefined,
        stars,
      });
      handleClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="장소 추가">
      <div className="flex flex-col gap-4">
        <PasteBox onParsed={setParsed} />

        {!parsed && (
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">직접 입력</label>
            <Input
              placeholder="장소 이름"
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
            />
          </div>
        )}

        {parsed && (
          <div className="rounded-xl bg-stone-50 p-3 text-sm">
            <p className="font-medium text-stone-900">{parsed.placeName}</p>
            {parsed.address && <p className="text-stone-500">{parsed.address}</p>}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">한 줄 감상</label>
          <Textarea
            value={memo}
            maxLength={LIMITS.memoMaxLength}
            onChange={(event) => setMemo(event.target.value)}
            rows={2}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">별점</label>
          <StarRating value={stars ?? 0} onChange={setStars} />
        </div>

        <Button onClick={handleSubmit} disabled={submitting || (!parsed && !manualName.trim())}>
          {submitting ? "추가하는 중..." : "보드에 담기"}
        </Button>
      </div>
    </Modal>
  );
}
