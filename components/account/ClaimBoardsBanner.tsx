"use client";

import { useState } from "react";
import { useOwnedBoards } from "@/lib/utils/ownerKey";

type State = "idle" | "sending" | "done" | "error";

// 로그인 상태에서만 렌더된다(부모 AccountPanel이 session 유무로 감쌈).
// 로컬에 저장된 ownerKey가 하나도 없으면 가져올 게 없으니 아예 아무것도
// 안 보여준다.
export function ClaimBoardsBanner() {
  const owned = useOwnedBoards();
  const [state, setState] = useState<State>("idle");
  const [claimedCount, setClaimedCount] = useState(0);

  if (state === "done") {
    return (
      <p className="text-xs text-stone-500">
        {claimedCount > 0 ? `이 브라우저의 보드 ${claimedCount}개를 계정에 연결했어요.` : "이미 전부 연결돼 있어요."}
      </p>
    );
  }
  if (owned.length === 0) return null;

  async function handleClaim() {
    setState("sending");
    try {
      const res = await fetch("/api/account/claim-boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerKeys: owned.map((b) => b.ownerKey) }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setClaimedCount(data.claimedCount ?? 0);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-accent/5 px-4 py-3">
      <p className="text-xs text-stone-600">이 브라우저에 로그인 전에 만든 보드가 있어요. 계정으로 가져올까요?</p>
      <button
        type="button"
        onClick={handleClaim}
        disabled={state === "sending"}
        className="shrink-0 text-xs font-semibold text-accent hover:underline disabled:opacity-60"
      >
        {state === "sending" ? "가져오는 중..." : "가져오기"}
      </button>
      {state === "error" && <p className="text-xs text-red-500">실패했어요, 다시 시도해주세요.</p>}
    </div>
  );
}
