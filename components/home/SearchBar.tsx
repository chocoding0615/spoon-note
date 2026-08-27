"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import type { SearchResultItem } from "@/app/api/search/route";

const DEBOUNCE_MS = 300;

// 홈 탭 검색창(§프롬프트 10) - 장소/지역/카테고리 검색. 결과는 아직 전용
// "장소 상세" 페이지가 없어서 지역 랭킹/커뮤니티 피드로 이어진다(§api/search).
export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!query.trim()) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  function handleSelect(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <div className="relative">
      <Input
        placeholder="장소, 지역, 카테고리를 검색해보세요"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && query.trim() && results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
          {results.map((result, index) => (
            <li key={`${result.type}-${result.label}-${index}`}>
              <button
                type="button"
                onMouseDown={() => handleSelect(result.href)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-stone-50"
              >
                <span>{result.type === "region" ? "📍" : "🍽️"}</span>
                <span className="flex-1 truncate text-stone-900">{result.label}</span>
                {result.sublabel && <span className="shrink-0 text-xs text-stone-400">{result.sublabel}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
