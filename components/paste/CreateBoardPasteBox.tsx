"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ImportListPreview } from "@/components/entry/ImportListPreview";
import { OWNER_KEY_HEADER } from "@/lib/constants";
import { saveOwnerKey } from "@/lib/utils/ownerKey";
import type { AddEntryInput } from "@/components/entry/AddEntryDialog";
import type { Board, ImportListResponse, ParseResponse } from "@/lib/types";

type Phase = "input" | "creating" | "placelist" | "error";

const PLACEHOLDER_TITLE = "새 보드";

/** 마이페이지의 "지도 링크로 보드 만들기"(§프롬프트 10 요구사항 3) 전용 - 기존
 *  `PasteBox`는 boardSlug가 있어야만(=이미 만들어진 보드 안에서만) 폴더 링크를
 *  인식하고, 없으면 미리보기 카드만 보여줄 뿐 실제로 아무것도 저장하지
 *  않았다(원래 이 조합으로 쓰인 적이 없어서 발견 못 했던 간극). 이 컴포넌트는
 *  제출 즉시 보드를 하나 만들고 그 위에서 기존 import-list/parse 파이프라인을
 *  그대로 태워서, 단일 링크든 폴더 링크든 한 번에 "붙여넣기 -> 보드 생성 ->
 *  장소 추가"까지 끝낸다. 보드 제목을 나중에 고치는 UI가 앱에 아직 없어서
 *  (§docs/worklog.md 2026-08-27), 제목은 이 시점에 아는 정보로 최대한
 *  의미 있게 지어준다(단일 장소면 장소명, 폴더면 폴더 이름/개수). */
export function CreateBoardPasteBox() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [errorMessage, setErrorMessage] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [importState, setImportState] = useState<{ url: string; result: ImportListResponse } | null>(null);

  function goToBoard(target: Board) {
    router.push(`/b/${target.slug}?ownerKey=${target.ownerKey}`);
  }

  async function renameBoard(target: Board, title: string) {
    if (title === target.title) return;
    try {
      await fetch(`/api/boards/${target.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", [OWNER_KEY_HEADER]: target.ownerKey },
        body: JSON.stringify({ title }),
      });
    } catch {
      // 제목 다듬기는 부가 동작이라 실패해도 무시 - 보드/장소는 이미 저장됐다.
    }
  }

  async function postEntry(target: Board, input: AddEntryInput) {
    const res = await fetch(`/api/boards/${target.slug}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [OWNER_KEY_HEADER]: target.ownerKey },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { ok: false as const, error: data?.error as string | undefined };
    }
    return { ok: true as const };
  }

  // ImportListPreview가 기대하는 시그니처(§ImportListPreview.tsx) - 첫 실패에서
  // 멈추고 그때까지 성공한 개수를 알려준다(BoardDetailClient.handleAddManyEntries와 동일 규칙).
  async function handleAddSelected(inputs: AddEntryInput[]): Promise<{ addedCount: number; error?: string }> {
    if (!board) return { addedCount: 0, error: "보드를 찾을 수 없어요." };
    let addedCount = 0;
    for (const input of inputs) {
      const result = await postEntry(board, input);
      if (!result.ok) return { addedCount, error: result.error };
      addedCount++;
    }
    return { addedCount };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl || phase === "creating") return;

    setPhase("creating");
    setErrorMessage("");

    const createRes = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: PLACEHOLDER_TITLE, visibility: "unlisted" }),
    }).catch(() => null);
    const createData = await createRes?.json().catch(() => null);
    if (!createRes?.ok || !createData?.board) {
      setErrorMessage("보드를 만들지 못했어요. 잠시 후 다시 시도해주세요.");
      setPhase("error");
      return;
    }
    const newBoard = createData.board as Board;
    saveOwnerKey(newBoard.slug, newBoard.ownerKey);
    setBoard(newBoard);

    let importData: ImportListResponse | null;
    try {
      const importRes = await fetch(`/api/boards/${newBoard.slug}/import-list`, {
        method: "POST",
        headers: { "Content-Type": "application/json", [OWNER_KEY_HEADER]: newBoard.ownerKey },
        body: JSON.stringify({ url: trimmedUrl }),
      });
      // 응답이 실패(429 레이트리밋 등)거나 형식이 이상하면 "폴더 아님(isPlacelist:false)"과
      // 절대 헷갈리면 안 된다 - 예전엔 여기서 상태코드를 안 봐서, 레이트리밋에 걸려도
      // 조용히 "인식 실패"로 취급되며 빈 보드로 넘어가는 버그가 있었다(보드는 저장되는데
      // 장소 데이터는 못 가져오는 것처럼 보임).
      if (!importRes.ok) {
        const data = await importRes.json().catch(() => null);
        setErrorMessage(data?.error ?? "장소 정보를 가져오지 못했어요. 잠시 후 다시 시도해주세요.");
        setPhase("error");
        return;
      }
      importData = (await importRes.json().catch(() => null)) as ImportListResponse | null;
      if (!importData) throw new Error("응답을 읽지 못했어요.");
    } catch {
      setErrorMessage("장소 정보를 가져오지 못했어요. 잠시 후 다시 시도해주세요.");
      setPhase("error");
      return;
    }

    if (importData.isPlacelist) {
      const count = importData.totalCount ?? importData.places?.length ?? 0;
      await renameBoard(newBoard, importData.folderName || `가져온 보드 (${count}개 장소)`);
      setImportState({ url: trimmedUrl, result: importData });
      setPhase("placelist");
      return;
    }

    // 폴더 링크가 아니면(isPlacelist:false, 정상 응답) 기존 단일 링크 파싱으로
    // 폴백한다(§PasteBox.parseSinglePlace와 동일 API).
    try {
      const parseRes = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
      });
      if (!parseRes.ok) {
        const data = await parseRes.json().catch(() => null);
        setErrorMessage(data?.error ?? "장소 정보를 가져오지 못했어요. 잠시 후 다시 시도해주세요.");
        setPhase("error");
        return;
      }
      const parseData = (await parseRes.json().catch(() => null)) as ParseResponse | null;

      if (parseData?.parsed) {
        await renameBoard(newBoard, parseData.parsed.placeName);
        await postEntry(newBoard, {
          source: parseData.parsed.source,
          placeName: parseData.parsed.placeName,
          address: parseData.parsed.address,
          lat: parseData.parsed.lat,
          lng: parseData.parsed.lng,
          sourceUrl: parseData.parsed.sourceUrl,
          category: parseData.parsed.category,
        });
      }
      // parsed가 null이면 진짜 인식 불가(정상 응답) - 보드는 이미 만들어졌으니
      // 그 안에서 직접 추가하면 된다(다른 화면의 "자동으로 인식하지 못한 링크"와 동일 취급).
      goToBoard(newBoard);
    } catch {
      setErrorMessage("네트워크 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
      setPhase("error");
    }
  }

  if (phase === "placelist" && board && importState) {
    return (
      <ImportListPreview
        boardSlug={board.slug}
        ownerKey={board.ownerKey}
        url={importState.url}
        initialResult={importState.result}
        onAddSelected={handleAddSelected}
        onDone={() => goToBoard(board)}
        onCancel={() => goToBoard(board)}
      />
    );
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
          disabled={phase === "creating"}
        />
        <Button type="submit" disabled={phase === "creating" || !url.trim()}>
          {phase === "creating" ? <Spinner /> : "스푼으로 떠먹기 🥄"}
        </Button>
      </form>
      {phase === "error" && (
        <div className="mt-3 text-sm">
          <p className="text-red-500">{errorMessage}</p>
          {board && (
            <Link href={`/b/${board.slug}?ownerKey=${board.ownerKey}`} className="mt-1 inline-block text-accent hover:underline">
              빈 보드는 만들어졌어요 - 안에서 직접 추가하기
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
