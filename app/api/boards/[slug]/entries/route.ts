import { NextResponse, type NextRequest } from "next/server";
import { getViewableBoard } from "@/lib/services/boardService";
import { addEntry, listEntries, reorderEntries } from "@/lib/services/entryService";
import { NotFoundError, OwnershipError, ValidationError } from "@/lib/services/errors";
import { OWNER_KEY_HEADER } from "@/lib/constants";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";
import type { Entry, PlaceSource } from "@/lib/types";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const ownerKey = request.nextUrl.searchParams.get("ownerKey") ?? undefined;

  try {
    const board = await getViewableBoard(slug, ownerKey);
    if (!board) return NextResponse.json({ error: "보드를 찾을 수 없어요." }, { status: 404 });

    const entries = await listEntries(slug);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("[entries] 조회 실패:", error);
    return NextResponse.json({ error: "장소를 불러오지 못했어요." }, { status: 500 });
  }
}

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
    console.error("[entries] 보드 조회 실패:", error);
    return NextResponse.json({ error: "장소를 추가하지 못했어요." }, { status: 500 });
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
    const entry = await addEntry(slug, {
      source: (typeof data.source === "string" ? data.source : "manual") as PlaceSource,
      placeName: typeof data.placeName === "string" ? data.placeName : "",
      address: typeof data.address === "string" ? data.address : undefined,
      lat: typeof data.lat === "number" ? data.lat : undefined,
      lng: typeof data.lng === "number" ? data.lng : undefined,
      category: typeof data.category === "string" ? data.category : undefined,
      sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : undefined,
      memo: typeof data.memo === "string" ? data.memo : undefined,
      stars: typeof data.stars === "number" ? (data.stars as Entry["stars"]) : undefined,
      country: typeof data.country === "string" ? data.country : undefined,
      city: typeof data.city === "string" ? data.city : undefined,
      authorName: typeof data.authorName === "string" ? data.authorName : undefined,
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[entries] 추가 실패:", error);
    return NextResponse.json({ error: "장소를 추가하지 못했어요." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const ownerKey = request.headers.get(OWNER_KEY_HEADER);
  if (!ownerKey) return NextResponse.json({ error: "권한이 없어요." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  const rawOrderedIds = (body as { orderedIds?: unknown } | null)?.orderedIds;
  const orderedIds = Array.isArray(rawOrderedIds)
    ? rawOrderedIds.filter((id): id is string => typeof id === "string")
    : [];

  try {
    await reorderEntries(slug, ownerKey, orderedIds);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof OwnershipError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("[entries] 순서 저장 실패:", error);
    return NextResponse.json({ error: "순서를 저장하지 못했어요." }, { status: 500 });
  }
}
