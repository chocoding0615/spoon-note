import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "지도로 보기",
  description: "지역별 찜 개수를 지도에서 확인하는 화면이에요.",
};

// 프롬프트 11에서 실제 지도 화면(지역별 찜 개수 시각화)을 만들기 전까지의
// 자리 표시 페이지 - 홈 탭의 "지도로 보기" 카드가 404로 이어지지 않게 한다.
export default function MapPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <span className="text-4xl">🗺️</span>
      <h1 className="text-lg font-semibold text-stone-900">지도로 보기, 준비 중이에요</h1>
      <p className="text-sm text-stone-500">지역별 찜 개수를 지도에서 보여주는 화면을 곧 만나보실 수 있어요.</p>
      <Link href="/" className="mt-2 text-sm font-medium text-accent hover:underline">
        홈으로 돌아가기
      </Link>
    </main>
  );
}
