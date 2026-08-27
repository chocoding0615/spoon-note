"use client";

import { Input } from "@/components/ui/Input";
import { DEFAULT_NICKNAME, LIMITS, VISIBILITY_OPTIONS } from "@/lib/constants";
import type { Visibility } from "@/lib/types";

interface VisibilitySelectorProps {
  value: Visibility;
  onChange: (value: Visibility) => void;
  /** "커뮤니티공개" 선택 시에만 쓰는 닉네임. 선택 입력이라 비워도 된다
   *  (비우면 DEFAULT_NICKNAME으로 표시) - 부모가 localStorage 저장된 값으로
   *  미리 채워주면 다음 보드부터는 다시 입력할 필요가 없다. */
  nickname: string;
  onNicknameChange: (nickname: string) => void;
}

export function VisibilitySelector({ value, onChange, nickname, onNicknameChange }: VisibilitySelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      {VISIBILITY_OPTIONS.map((option) => (
        <label
          key={option.value}
          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
            value === option.value ? "border-accent bg-orange-50" : "border-stone-200"
          }`}
        >
          <input
            type="radio"
            name="visibility"
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium text-stone-900">{option.label}</span>
            <span className="block text-xs text-stone-500">{option.description}</span>
          </span>
        </label>
      ))}

      {value === "community" && (
        <div className="ml-1 mt-1 rounded-xl bg-stone-50 p-3">
          <label className="mb-1 block text-xs font-medium text-stone-500">
            커뮤니티 닉네임 (선택 - 비워두면 &ldquo;{DEFAULT_NICKNAME}&rdquo;로 표시돼요)
          </label>
          <Input
            value={nickname}
            maxLength={LIMITS.nicknameMaxLength}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder={DEFAULT_NICKNAME}
          />
        </div>
      )}
    </div>
  );
}
