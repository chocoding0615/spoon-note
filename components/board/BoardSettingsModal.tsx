"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { VisibilitySelector } from "./VisibilitySelector";
import { OWNER_KEY_HEADER, LIMITS } from "@/lib/constants";
import { getNickname, saveNickname } from "@/lib/utils/nickname";
import { removeOwnerKey } from "@/lib/utils/ownerKey";
import type { Board, Visibility } from "@/lib/types";

interface BoardSettingsModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
  ownerKey: string;
  /** 저장 성공 시 부모(BoardDetailClient)의 board 상태를 갱신 - 새로고침 없이 반영되게 한다. */
  onUpdated: (board: Board) => void;
}

/** 보드 상세 화면의 "설정" - 제목/설명/공개설정 수정과 삭제를 한 곳에 모았다
 *  (사용자 요청: "생성된거도 비공개,공개,일부 수정 가능하도록", "보드 삭제 기능").
 *  수정은 기존 `updateBoard` 서비스(PATCH /api/boards/[slug])를, 공개설정 UI는
 *  `/boards/new`에서 쓰던 `VisibilitySelector`를 그대로 재사용한다. */
export function BoardSettingsModal({ open, onClose, board, ownerKey, onUpdated }: BoardSettingsModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState(board.title);
  const [description, setDescription] = useState(board.description ?? "");
  const [visibility, setVisibility] = useState<Visibility>(board.visibility);
  const [nickname, setNickname] = useState(board.nickname || getNickname());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    if (saving || deleting) return;
    setError("");
    onClose();
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving || deleting) return;

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/boards/${board.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", [OWNER_KEY_HEADER]: ownerKey },
        body: JSON.stringify({
          title: trimmedTitle,
          description,
          visibility,
          nickname: visibility === "community" ? nickname : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "설정을 저장하지 못했어요.");
        return;
      }
      if (visibility === "community" && nickname.trim()) saveNickname(nickname.trim());
      onUpdated(data.board as Board);
      onClose();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (saving || deleting) return;
    if (!window.confirm("이 보드를 삭제하시겠어요? 되돌릴 수 없어요.")) return;

    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/boards/${board.slug}`, {
        method: "DELETE",
        headers: { [OWNER_KEY_HEADER]: ownerKey },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "보드를 삭제하지 못했어요.");
        setDeleting(false);
        return;
      }
      removeOwnerKey(board.slug);
      router.push("/my");
    } catch {
      setError("네트워크 오류가 발생했어요.");
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="보드 설정">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">제목</label>
          <Input value={title} maxLength={LIMITS.titleMaxLength} onChange={(event) => setTitle(event.target.value)} />
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

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleting}
            className="text-sm font-medium text-red-500 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? "삭제하는 중..." : "보드 삭제"}
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose} disabled={saving || deleting}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving || deleting || !title.trim()}>
              {saving ? "저장하는 중..." : "저장"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
