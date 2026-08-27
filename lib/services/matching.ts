import { COMMUNITY } from "../constants";
import type { PlaceSource } from "../types";

/** 소스별 sourceUrl에서 안정적인 원본 place ID를 뽑는다. 같은 서비스 안에서는
 *  이 ID로 정확 매칭한다. 구글/manual은 안정적인 원본 ID가 없어(알려진 한계)
 *  null을 반환하고, 호출부는 이 경우 항상 근사 매칭(좌표+이름) 경로로 넘어간다. */
export function extractPlaceId(source: PlaceSource, sourceUrl: string | undefined): string | null {
  if (!sourceUrl) return null;
  if (source === "naver") return sourceUrl.match(/\/place\/(\d+)/)?.[1] ?? null;
  if (source === "kakao") return sourceUrl.match(/place\.map\.kakao\.com\/(\d+)/)?.[1] ?? null;
  return null;
}

/** 두 좌표 사이의 실제 거리(미터). 지구를 구로 근사하는 Haversine 공식 - 50m
 *  단위 근사 매칭에는 타원체 보정까지는 불필요한 정밀도라 충분하다. */
export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const EARTH_RADIUS_M = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** 편집 거리(Levenshtein). 표기 차이("스타벅스 강남점" vs "스타벅스 강남 DT점")
 *  정도는 흡수하되, 완전히 다른 이름까지 매칭시키진 않도록 유사도 계산에만 쓴다. */
function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[rows - 1][cols - 1];
}

function normalizeName(name: string): string {
  // 공백/기호 차이("스타벅스 강남점" vs "스타벅스강남점") 정도는 유사도 계산 전에
  // 흡수한다. 대소문자 구분은 한글엔 의미 없지만 영문 표기가 섞일 수 있어 유지.
  return name.replace(/\s+/g, "").toLowerCase();
}

/** 0(완전히 다름) ~ 1(동일) 사이의 이름 유사도. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const distance = levenshteinDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - distance / maxLen;
}

export interface MatchCandidate {
  id: string;
  placeName: string;
  lat?: number;
  lng?: number;
  sources: { source: PlaceSource; placeId: string }[];
}

export interface MatchTarget {
  source: PlaceSource;
  placeId: string | null;
  placeName: string;
  lat?: number;
  lng?: number;
}

/** target이 candidates 중 어느 것과 같은 실제 장소인지 판정하는 순수 함수(부작용
 *  없음 - Firestore 접근은 호출부의 책임). 우선순위:
 *  1) 같은 소스 + 같은 원본 placeId → 정확 매칭
 *  2) 좌표 반경(matchRadiusMeters) 이내 + 이름 유사도(matchNameSimilarity) 이상 → 근사 매칭
 *  둘 다 아니면 null(새 canonical place로 취급) - 애매하면 별개로 두는 쪽을 우선한다. */
export function decideMatch(target: MatchTarget, candidates: MatchCandidate[]): MatchCandidate | null {
  if (target.placeId) {
    const exact = candidates.find((c) =>
      c.sources.some((s) => s.source === target.source && s.placeId === target.placeId)
    );
    if (exact) return exact;
  }

  if (target.lat === undefined || target.lng === undefined) return null; // 좌표 없으면 근사 매칭 불가

  let best: { candidate: MatchCandidate; similarity: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.lat === undefined || candidate.lng === undefined) continue;
    const distance = haversineDistanceMeters(
      { lat: target.lat, lng: target.lng },
      { lat: candidate.lat, lng: candidate.lng }
    );
    if (distance > COMMUNITY.matchRadiusMeters) continue;

    const similarity = nameSimilarity(target.placeName, candidate.placeName);
    if (similarity < COMMUNITY.matchNameSimilarity) continue;

    if (!best || similarity > best.similarity) best = { candidate, similarity };
  }
  return best?.candidate ?? null;
}
