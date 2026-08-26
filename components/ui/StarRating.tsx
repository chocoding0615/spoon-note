"use client";

const STARS = [1, 2, 3, 4, 5] as const;

interface StarRatingProps {
  value: 0 | 1 | 2 | 3 | 4 | 5;
  onChange?: (value: 1 | 2 | 3 | 4 | 5) => void;
  readOnly?: boolean;
}

export function StarRating({ value, onChange, readOnly = false }: StarRatingProps) {
  return (
    <div className="flex gap-0.5">
      {STARS.map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(star)}
          aria-label={`${star}점`}
          className={`text-lg leading-none ${readOnly ? "cursor-default" : "cursor-pointer"} ${
            star <= value ? "text-amber-400" : "text-stone-200"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
