"use client";

import { VISIBILITY_OPTIONS } from "@/lib/constants";
import type { Visibility } from "@/lib/types";

interface VisibilitySelectorProps {
  value: Visibility;
  onChange: (value: Visibility) => void;
}

export function VisibilitySelector({ value, onChange }: VisibilitySelectorProps) {
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
    </div>
  );
}
