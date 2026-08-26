"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SOURCE_META, OWNER_KEY_HEADER } from "@/lib/constants";
import type { ParsedPlace, ParseResponse, ImportListResponse } from "@/lib/types";

type Status = "idle" | "loading" | "success" | "manual" | "error";

interface PasteBoxProps {
  /** 파싱 성공(ParsedPlace) 또는 수동 폴백(null)을 부모에게 알린다. AddEntryDialog 등에서 사용. */
  onParsed?: (place: ParsedPlace | null) => void;
  /** 주어지면(보드 상세 화면 등) 링크를 붙여넣었을 때 폴더(저장 목록) 링크인지
   *  먼저 확인한다 - 폴더 링크면 onParsed 대신 onParsedList로 알린다. */
  boardSlug?: string;
  ownerKey?: string;
  onParsedList?: (result: ImportListResponse, url: string) => void;
}

export function PasteBox({ onParsed, boardSlug, ownerKey, onParsedList }: PasteBoxProps = {}) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ParsedPlace | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function parseSinglePlace(trimmedUrl: string) {
    const res = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trimmedUrl }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setErrorMessage(data?.error ?? "링크를 확인하지 못했어요.");
      setStatus("error");
      return;
    }

    const data = (await res.json()) as ParseResponse;
    if (data.parsed) {
      setResult(data.parsed);
      setStatus("success");
      onParsed?.(data.parsed);
    } else {
      setStatus("manual");
      onParsed?.(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl || status === "loading") return;

    setStatus("loading");
    setErrorMessage("");
    setResult(null);

    try {
      if (boardSlug) {
        const res = await fetch(`/api/boards/${boardSlug}/import-list`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(ownerKey ? { [OWNER_KEY_HEADER]: ownerKey } : {}),
          },
          body: JSON.stringify({ url: trimmedUrl }),
        });
        const data = (await res.json().catch(() => null)) as ImportListResponse | null;

        if (data?.isPlacelist) {
          setStatus("idle");
          setUrl("");
          onParsedList?.(data, trimmedUrl);
          return;
        }
        // 폴더 링크가 아니면(또는 요청 자체가 실패했으면) 기존 단일 링크 파싱으로 폴백
      }

      await parseSinglePlace(trimmedUrl);
    } catch {
      setErrorMessage("네트워크 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
      setStatus("error");
    }
  }

  return (
    <div className="w-full max-w-xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="url"
          inputMode="url"
          placeholder="네이버·카카오·구글 지도 링크를 붙여넣으세요"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={status === "loading"}
        />
        <Button type="submit" disabled={status === "loading" || !url.trim()}>
          {status === "loading" ? <Spinner /> : "스푼으로 떠먹기 🥄"}
        </Button>
      </form>

      {status === "success" && result && (
        <Card className="mt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-stone-900">{result.placeName}</p>
              {result.address && <p className="mt-1 text-sm text-stone-500">{result.address}</p>}
            </div>
            <Badge
              color={SOURCE_META[result.source].color}
              textColor={SOURCE_META[result.source].textColor}
              className="shrink-0"
            >
              {SOURCE_META[result.source].label}
            </Badge>
          </div>
        </Card>
      )}

      {status === "manual" && (
        <Card className="mt-4 border-dashed text-sm text-stone-500">
          자동으로 인식하지 못한 링크예요. 보드에서는 직접 입력 모드로 추가할 수 있어요.
        </Card>
      )}

      {status === "error" && <p className="mt-3 text-sm text-red-500">{errorMessage}</p>}
    </div>
  );
}
