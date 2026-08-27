"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OWNER_KEY_HEADER, LIMITS } from "@/lib/constants";
import { useOwnedBoards, saveOwnerKey } from "@/lib/utils/ownerKey";
import type { Board, CollectiblePlace } from "@/lib/types";

interface CollectModalProps {
  place: CollectiblePlace;
  onClose: () => void;
}

const NEW_BOARD_VALUE = "__new__";

type SubmitState = "idle" | "submitting" | "duplicate" | "error" | "done";

// 커뮤니티 피드/지역 랭킹에서 본 장소를 로컬에 저장된 "내 보드" 중 하나로
// 옮기거나(§lib/utils/ownerKey.useOwnedBoards) 새 보드를 만들어 담는다(프롬프트 8).
// 실제 추가는 서버의 collectEntry(기존 addEntry 재사용 + 중복 검사)가 처리한다.
export function CollectModal({ place, onClose }: CollectModalProps) {
  const owned = useOwnedBoards();
  const ownerKeyBySlug = Object.fromEntries(owned.map(({ slug, ownerKey }) => [slug, ownerKey]));
  const ownerKeysParam = owned.map(({ ownerKey }) => ownerKey).join(",");

  const [boards, setBoards] = useState<Board[]>([]);
  const [hasFetchedBoards, setHasFetchedBoards] = useState(false);
  const loadingBoards = Boolean(ownerKeysParam) && !hasFetchedBoards;
  const [selected, setSelected] = useState("");
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [doneSlug, setDoneSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerKeysParam) return; // 소유한 보드가 없으면 fetch 자체가 필요 없다(§/my 페이지와 동일 패턴)
    fetch(`/api/boards?ownerKeys=${encodeURIComponent(ownerKeysParam)}`)
      .then((res) => res.json())
      .then((data) => setBoards(data.boards ?? []))
      .finally(() => setHasFetchedBoards(true));
  }, [ownerKeysParam]);

  function selectTarget(value: string) {
    setSelected(value);
    setSubmitState("idle");
    setErrorMessage("");
  }

  async function collectInto(slug: string, ownerKey?: string) {
    const res = await fetch(`/api/boards/${slug}/collect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ownerKey ? { [OWNER_KEY_HEADER]: ownerKey } : {}),
      },
      body: JSON.stringify(place),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setErrorMessage(data?.error ?? "장소를 담지 못했어요.");
      setSubmitState("error");
      return;
    }
    if (data?.status === "duplicate") {
      setSubmitState("duplicate");
      return;
    }
    setDoneSlug(slug);
    setSubmitState("done");
  }

  async function handleSubmit() {
    if (submitState === "submitting" || !selected) return;

    if (selected === NEW_BOARD_VALUE) {
      const title = newBoardTitle.trim();
      if (!title) return;
      setSubmitState("submitting");
      try {
        const res = await fetch("/api/boards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, visibility: "unlisted" }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.board) {
          setErrorMessage(data?.error ?? "보드를 만들지 못했어요.");
          setSubmitState("error");
          return;
        }
        saveOwnerKey(data.board.slug, data.board.ownerKey);
        await collectInto(data.board.slug, data.board.ownerKey);
      } catch {
        setErrorMessage("보드를 만들지 못했어요.");
        setSubmitState("error");
      }
      return;
    }

    setSubmitState("submitting");
    try {
      await collectInto(selected, ownerKeyBySlug[selected]);
    } catch {
      setErrorMessage("장소를 담지 못했어요.");
      setSubmitState("error");
    }
  }

  return (
    <Modal open onClose={onClose} title="담아가기">
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-stone-50 p-3 text-sm">
          <p className="font-medium text-stone-900">{place.placeName}</p>
          {place.address && <p className="text-stone-500">{place.address}</p>}
        </div>

        {submitState === "done" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-stone-700">담았어요!</p>
            {doneSlug && (
              <Link
                href={`/b/${doneSlug}?ownerKey=${ownerKeyBySlug[doneSlug] ?? ""}`}
                className="text-sm font-medium text-accent hover:underline"
              >
                보드에서 확인하기
              </Link>
            )}
            <Button variant="ghost" onClick={onClose}>
              닫기
            </Button>
          </div>
        ) : (
          <>
            {loadingBoards ? (
              <p className="text-sm text-stone-400">내 보드 불러오는 중...</p>
            ) : (
              <div className="flex max-h-60 flex-col gap-2 overflow-y-auto">
                {boards.length === 0 && (
                  <p className="text-sm text-stone-400">아직 만든 보드가 없어요 - 새 보드로 담아보세요.</p>
                )}
                {boards.map((board) => (
                  <label
                    key={board.slug}
                    className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
                      selected === board.slug ? "border-accent bg-accent/5" : "border-stone-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="collect-target"
                      checked={selected === board.slug}
                      onChange={() => selectTarget(board.slug)}
                    />
                    <span className="flex-1 truncate text-stone-900">{board.title}</span>
                  </label>
                ))}

                <label
                  className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
                    selected === NEW_BOARD_VALUE ? "border-accent bg-accent/5" : "border-stone-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="collect-target"
                    checked={selected === NEW_BOARD_VALUE}
                    onChange={() => selectTarget(NEW_BOARD_VALUE)}
                  />
                  <span className="text-stone-900">+ 새 보드 만들기</span>
                </label>

                {selected === NEW_BOARD_VALUE && (
                  <Input
                    placeholder="새 보드 이름"
                    value={newBoardTitle}
                    maxLength={LIMITS.titleMaxLength}
                    onChange={(event) => setNewBoardTitle(event.target.value)}
                  />
                )}
              </div>
            )}

            {submitState === "duplicate" && <p className="text-sm text-amber-600">이미 담긴 장소예요.</p>}
            {submitState === "error" && <p className="text-sm text-red-500">{errorMessage}</p>}

            <Button
              onClick={handleSubmit}
              disabled={
                submitState === "submitting" || !selected || (selected === NEW_BOARD_VALUE && !newBoardTitle.trim())
              }
            >
              {submitState === "submitting" ? "담는 중..." : "담기"}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
