"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { VisibilitySelector } from "@/components/board/VisibilitySelector";
import { CreateBoardPasteBox } from "@/components/paste/CreateBoardPasteBox";
import { LIMITS } from "@/lib/constants";
import { saveOwnerKey, useOwnedBoards } from "@/lib/utils/ownerKey";
import { getNickname, saveNickname } from "@/lib/utils/nickname";
import type { Board, Visibility } from "@/lib/types";

export default function NewBoardPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("unlisted");
  // 이전에 커뮤니티공개로 만든 적 있으면 그때 쓴 닉네임을 미리 채워서 "재사용"되게 한다.
  const [nickname, setNickname] = useState(() => getNickname());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ownerKey가 보드마다 개별 발급이라 계정 개념이 없다 - 서버가 아니라
  // 로컬에 저장된 개수로만 무료 한도를 안내한다(v0 한계, 우회 가능함을 감수).
  const ownedCount = useOwnedBoards().length;
  const limitReached = ownedCount >= LIMITS.freeBoards;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          visibility,
          nickname: visibility === "community" ? nickname : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "보드를 만들지 못했어요.");
        return;
      }

      const board = data.board as Board;
      saveOwnerKey(board.slug, board.ownerKey);
      if (visibility === "community" && nickname.trim()) saveNickname(nickname.trim());
      router.push(`/b/${board.slug}?ownerKey=${board.ownerKey}`);
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (limitReached) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center gap-3 px-6 py-24 text-center">
        <h1 className="text-xl font-bold text-stone-900">무료로 만들 수 있는 보드는 최대 {LIMITS.freeBoards}개예요</h1>
        <p className="text-sm text-stone-500">지금은 이미 {ownedCount}개를 만드셨어요. 추가 보드는 곧 지원할 예정이에요.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-bold text-stone-900">새 보드 만들기</h1>

      <div>
        <h2 className="mb-2 text-sm font-medium text-stone-700">지도 링크로 빠르게 만들기</h2>
        <CreateBoardPasteBox />
      </div>

      <div className="flex items-center gap-3 text-xs text-stone-400">
        <div className="h-px flex-1 bg-stone-200" />
        또는 직접 입력
        <div className="h-px flex-1 bg-stone-200" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">제목</label>
          <Input
            value={title}
            maxLength={LIMITS.titleMaxLength}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예) 을지로 노포 투어"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">설명 (선택)</label>
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">공개 설정</label>
          <VisibilitySelector
            value={visibility}
            onChange={setVisibility}
            nickname={nickname}
            onNicknameChange={setNickname}
          />
        </div>

        {error && (
          <p className="text-sm text-red-500">
            {error}
            {error.includes("로그인") && (
              <>
                {" "}
                <Link href="/my" className="font-medium underline">
                  로그인하러 가기
                </Link>
              </>
            )}
          </p>
        )}

        <Button type="submit" disabled={submitting || !title.trim()}>
          {submitting ? "만드는 중..." : "보드 만들기"}
        </Button>
      </form>
    </main>
  );
}
