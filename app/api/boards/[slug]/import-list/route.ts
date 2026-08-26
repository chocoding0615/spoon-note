import { NextResponse, type NextRequest } from "next/server";
import { getViewableBoard } from "@/lib/services/boardService";
import { listEntries } from "@/lib/services/entryService";
import { detectPlacelist, type PlacelistResult, type PlacelistSource } from "@/lib/parsers/placelist";
import { parseNaverPlacelist } from "@/lib/parsers/naverPlacelist";
import { parseGooglePlacelist } from "@/lib/parsers/googlePlacelist";
import { parseKakaoPlacelist } from "@/lib/parsers/kakaoPlacelist";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";
import { isSafeUrl } from "@/lib/parsers/http";
import { LIMITS, OWNER_KEY_HEADER } from "@/lib/constants";
import type { ImportListResponse } from "@/lib/types";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

const PARSER_BY_SOURCE: Record<PlacelistSource, (url: string) => Promise<PlacelistResult | null>> = {
  naver: parseNaverPlacelist,
  google: parseGooglePlacelist,
  kakao: parseKakaoPlacelist,
};

// 이 라우트는 "폴더(저장 목록) 링크 가져오기" 전용이다. 개별 장소 링크는 여기서
// 다루지 않고 isPlacelist:false로 응답한다 - 클라이언트가 기존 /api/parse 흐름
// (단일 링크 파싱)으로 그대로 폴백하면 된다. 기존 단일 링크 파싱 로직은 안 건드림.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;

  const ip = getClientIp(request.headers);
  const rateLimit = await checkRateLimit(ip, RATE_LIMITS.importList);
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "요청이 너무 많아요. 잠시 후 다시 시도해주세요." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const ownerKey = request.headers.get(OWNER_KEY_HEADER) ?? undefined;
  let board;
  try {
    board = await getViewableBoard(slug, ownerKey);
  } catch (error) {
    console.error("[import-list] 보드 조회 실패:", error);
    return NextResponse.json({ error: "보드를 확인하지 못했어요." }, { status: 500 });
  }
  if (!board) return NextResponse.json({ error: "보드를 찾을 수 없어요." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  const rawUrl = (body as { url?: unknown } | null)?.url;
  const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!url || !isSafeUrl(url)) {
    return NextResponse.json({ error: "지원하지 않는 링크예요." }, { status: 400 });
  }

  const detection = await detectPlacelist(url).catch(() => null);
  if (!detection) {
    return NextResponse.json({ isPlacelist: false } satisfies ImportListResponse);
  }

  let result: PlacelistResult | null;
  try {
    result = await PARSER_BY_SOURCE[detection.source](url);
  } catch (error) {
    console.error("[import-list] 파싱 실패:", error);
    result = null;
  }

  if (!result) {
    return NextResponse.json({
      isPlacelist: true,
      source: detection.source,
      error: "장소 목록을 가져오지 못했어요. 잠시 후 다시 시도해주세요.",
      places: [],
      totalCount: 0,
      importedCount: 0,
      truncated: false,
      partial: true,
    } satisfies ImportListResponse);
  }

  const existingEntries = await listEntries(slug).catch(() => []);
  const existingSourceUrls = new Set(existingEntries.map((entry) => entry.sourceUrl).filter(Boolean));

  const truncated = result.places.length > LIMITS.importListMax;
  const capped = result.places.slice(0, LIMITS.importListMax);
  const places = capped.map((place) => ({
    ...place,
    isDuplicate: place.sourceUrl ? existingSourceUrls.has(place.sourceUrl) : false,
  }));

  return NextResponse.json({
    isPlacelist: true,
    source: detection.source,
    places,
    totalCount: result.totalCount,
    importedCount: places.length,
    truncated,
    partial: result.partial,
  } satisfies ImportListResponse);
}
