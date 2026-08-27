import { Card } from "@/components/ui/Card";

// 에디터 큐레이션 배너 자리(§프롬프트 10 요구사항 4) - 지금은 정적 슬롯만
// 두고 실제 콘텐츠(에디터가 고른 보드/테마) 연결은 이후 별도 작업.
export function CurationBannerSlot() {
  return (
    <Card className="flex items-center gap-3 border-dashed p-5 text-stone-400">
      <span className="text-2xl">✏️</span>
      <p className="text-sm">에디터 추천 콘텐츠 자리 - 곧 채워질 예정이에요</p>
    </Card>
  );
}
