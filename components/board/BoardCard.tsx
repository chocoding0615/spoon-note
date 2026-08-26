import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { VISIBILITY_OPTIONS } from "@/lib/constants";
import type { Board } from "@/lib/types";

interface BoardCardProps {
  board: Board;
  href: string;
}

export function BoardCard({ board, href }: BoardCardProps) {
  const visibilityLabel = VISIBILITY_OPTIONS.find((option) => option.value === board.visibility)?.label;

  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-stone-900">{board.title}</h3>
          <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
            {visibilityLabel}
          </span>
        </div>
        {board.description && (
          <p className="mt-1 line-clamp-2 text-sm text-stone-500">{board.description}</p>
        )}
      </Card>
    </Link>
  );
}
