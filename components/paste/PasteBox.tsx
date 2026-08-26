"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SOURCE_META } from "@/lib/constants";
import type { ParsedPlace, ParseResponse } from "@/lib/types";

type Status = "idle" | "loading" | "success" | "manual" | "error";

export function PasteBox() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ParsedPlace | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!url.trim() || status === "loading") return;

    setStatus("loading");
    setErrorMessage("");
    setResult(null);

    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
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
      } else {
        setStatus("manual");
      }
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
