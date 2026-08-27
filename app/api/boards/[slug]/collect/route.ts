import { NextResponse, type NextRequest } from "next/server";
import { getViewableBoard } from "@/lib/services/boardService";
import { collectEntry } from "@/lib/services/entryService";
import { ValidationError } from "@/lib/services/errors";
import { OWNER_KEY_HEADER } from "@/lib/constants";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";
import type { PlaceSource } from "@/lib/types";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// "담아가기"(프롬프트 8) 전용 라우트 - 기존 POST .../entries와 거의 같은 모양이지만
// addEntry 대신 중복 검사가 포함된 collectEntry를 호출하고, 결과에 "이미 담긴
// 장소"인지 여부가 별도로 실려온다는 점이 다르다.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const ownerKey = request.headers.get(OWNER_KEY_HEADER) ?? undefined;

  const ip = getClientIp(request.headers);
  const rateLimit = await checkRateLimit(ip, RATE_LIMITS.addEntry);
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "요청이 너무 많아요. 잠시 후 다시 시도해주세요." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds
          ? { "Retry-After": String(rateLimit.retryAfterSeconds) }
          : undefined,
      }
    );
  }

  let board;
  try {
    board = await getViewableBoard(slug, ownerKey);
  } catch (error) {
    console.error("[collect] 보드 조회 실패:", error);
    return NextResponse.json({ error: "장소를 담지 못했어요." }, { status: 500 });
  }
  if (!board) return NextResponse.json({ error: "보드를 찾을 수 없어요." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  const data = (body ?? {}) as Record<string, unknown>;

  try {
    const result = await collectEntry(
      slug,
      {
        source: (typeof data.source === "string" ? data.source : "manual") as PlaceSource,
        placeName: typeof data.placeName === "string" ? data.placeName : "",
        address: typeof data.address === "string" ? data.address : undefined,
        lat: typeof data.lat === "number" ? data.lat : undefined,
        lng: typeof data.lng === "number" ? data.lng : undefined,
        category: typeof data.category === "string" ? data.category : undefined,
        photos: Array.isArray(data.photos)
          ? data.photos.filter((p): p is string => typeof p === "string")
          : undefined,
        sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : undefined,
      },
      typeof data.canonicalId === "string" ? data.canonicalId : undefined
    );

    if (result.status === "duplicate") {
      return NextResponse.json({ status: "duplicate" });
    }
    return NextResponse.json({ status: "added", entry: result.entry }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[collect] 담기 실패:", error);
    return NextResponse.json({ error: "장소를 담지 못했어요." }, { status: 500 });
  }
}
