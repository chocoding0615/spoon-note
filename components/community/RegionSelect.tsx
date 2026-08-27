"use client";

import { useRouter, usePathname } from "next/navigation";
import { Select } from "@/components/ui/Select";

interface RegionSelectProps {
  regions: string[];
  value: string;
  /** 있으면 "필터 없음"(전체 보기) 옵션을 맨 앞에 추가한다 - 피드는 전체 보기가
   *  기본이지만, 랭킹 페이지는 지역 선택이 필수라 이 옵션 자체를 안 넘긴다. */
  allLabel?: string;
  /** 같은 화면의 다른 컨트롤(예: 커뮤니티 피드의 정렬 옵션)이 쓰는 쿼리 파라미터를
   *  이 값 그대로 유지한 채 region만 바꾼다 - 안 넘기면 예전처럼 region 하나만 남긴다. */
  preserveParams?: Record<string, string>;
}

// 지역 선택 시 서버 컴포넌트가 searchParams.region 기준으로 다시 렌더하도록
// URL을 바꾸기만 한다(피드/랭킹 페이지 둘 다 이 방식) - 별도 클라이언트 상태 없음.
export function RegionSelect({ regions, value, allLabel, preserveParams }: RegionSelectProps) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(next: string) {
    const params = new URLSearchParams(preserveParams);
    if (next) params.set("region", next);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const options = [
    ...(allLabel ? [{ value: "", label: allLabel }] : []),
    ...regions.map((region) => ({ value: region, label: region })),
  ];

  return (
    <Select
      options={options}
      value={value}
      onChange={(event) => handleChange(event.target.value)}
      className="w-auto min-w-[8rem]"
    />
  );
}
