import Link from "next/link";
import { PasteBox } from "@/components/paste/PasteBox";
import { Button } from "@/components/ui/Button";
import { SOURCE_META } from "@/lib/constants";

const SUPPORTED_SOURCES = ["naver", "kakao", "google"] as const;

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-20 sm:py-28">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <span className="text-4xl">🥄</span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
          흩어진 맛집 링크,
          <br />
          스푼노트에 다 모아
        </h1>
        <p className="mt-4 text-base text-stone-500">
          카톡방에 흩어진 지도 링크를 붙여넣으면, 지도와 리스트로 정리된 보드 하나로
          모여요. 링크 하나로 친구와 공유하세요.
        </p>

        <div className="mt-10 flex justify-center">
          <PasteBox />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Link href="/boards/new">
            <Button>보드 만들기</Button>
          </Link>
          <Link href="/my" className="text-sm font-medium text-stone-500 hover:text-stone-700">
            내 보드 보기
          </Link>
        </div>

        <div className="mt-10 flex items-center gap-3 text-sm text-stone-400">
          <span>지원 링크</span>
          <div className="flex gap-2">
            {SUPPORTED_SOURCES.map((source) => (
              <span
                key={source}
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: SOURCE_META[source].color,
                  color: SOURCE_META[source].textColor,
                }}
              >
                {SOURCE_META[source].label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
