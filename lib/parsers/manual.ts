import type { ParsedPlace } from "../types";

/** 파싱 실패 시 수동 입력 모드에서 사용자가 직접 채운 값으로 ParsedPlace를 구성한다.
 *  URL 기반이 아니라 registry(PlaceParser[])에는 포함하지 않는다. */
export function createManualPlace(input: {
  placeName: string;
  address?: string;
  lat?: number;
  lng?: number;
  category?: string;
}): ParsedPlace {
  return { source: "manual", sourceUrl: "", ...input };
}
