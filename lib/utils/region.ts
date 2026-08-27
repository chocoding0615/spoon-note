import type { Entry } from "../types";

/** 주소 문자열에서 "시/구" 단위 지역명을 뽑는다. 행정구역 데이터베이스를 따로
 *  두지 않고 토큰 접미사만 보는 휴리스틱이다(하드코딩된 지역 목록 없음 -
 *  원칙적으로 어떤 한국 주소든 같은 규칙으로 처리됨). 정확한 행정동 경계가
 *  아니라 "대충 어느 동네인지" 필터/집계용이라 이 정도 근사면 충분하다:
 *  - "구"나 "군"으로 끝나는 토큰이 있으면 그걸 우선(가장 세밀한 단위) -
 *    예: "경기 성남시 분당구 ..." -> "분당구", "부산 해운대구 ..." -> "해운대구"
 *  - 없으면 첫 토큰이 아닌 "시"로 끝나는 토큰 - 예: "제주 제주시 ..." -> "제주시"
 *  - 그마저도 없으면 첫 토큰(보통 시/도) 그대로 - 예: "세종 ..." -> "세종"
 */
export function extractRegion(address: string | undefined): string | null {
  if (!address) return null;
  const tokens = address.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const guOrGun = tokens.find((token) => /(구|군)$/.test(token));
  if (guOrGun) return guOrGun;

  const si = tokens.find((token, index) => index > 0 && /시$/.test(token));
  if (si) return si;

  return tokens[0];
}

/** 보드에 담긴 엔트리들의 주소에서 가장 많이 나오는 지역을 고른다(최빈값).
 *  동률이면 먼저 나온(=엔트리 배열 순서상 앞선) 지역을 우선한다. */
export function dominantRegion(entries: Pick<Entry, "address">[]): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestCount = 0;

  for (const entry of entries) {
    const region = extractRegion(entry.address);
    if (!region) continue;
    const next = (counts.get(region) ?? 0) + 1;
    counts.set(region, next);
    if (next > bestCount) {
      best = region;
      bestCount = next;
    }
  }

  return best;
}
