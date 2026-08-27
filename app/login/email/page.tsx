"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LIMITS } from "@/lib/constants";

type Mode = "login" | "signup";

export default function EmailLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const path = mode === "signup" ? "/api/auth/email/signup" : "/api/auth/email/login";
      const body =
        mode === "signup"
          ? { email, password, nickname, birthYear: Number(birthYear) }
          : { email, password };

      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "요청을 처리하지 못했어요.");
        return;
      }
      router.push("/my");
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-bold text-stone-900">{mode === "signup" ? "이메일로 가입하기" : "이메일로 로그인"}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">이메일</label>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">비밀번호</label>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={mode === "signup" ? 8 : undefined}
            required
          />
          {mode === "signup" && <p className="mt-1 text-xs text-stone-400">8자 이상으로 입력해주세요.</p>}
        </div>

        {mode === "signup" && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">닉네임</label>
              <Input
                value={nickname}
                maxLength={LIMITS.nicknameMaxLength}
                onChange={(event) => setNickname(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">출생연도</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="예) 1998"
                value={birthYear}
                onChange={(event) => setBirthYear(event.target.value)}
                required
              />
              <p className="mt-1 text-xs text-stone-400">
                커뮤니티 기능은 만 14세 이상만 이용할 수 있어서 확인이 필요해요.
              </p>
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button type="submit" disabled={submitting}>
          {submitting ? "처리하는 중..." : mode === "signup" ? "가입하고 시작하기" : "로그인"}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode((prev) => (prev === "signup" ? "login" : "signup"));
          setError("");
        }}
        className="text-sm text-stone-500 underline decoration-dotted"
      >
        {mode === "signup" ? "이미 계정이 있어요" : "계정이 없어요, 가입할래요"}
      </button>
    </main>
  );
}
