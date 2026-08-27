import { NextResponse, type NextRequest } from "next/server";
import { createBoard, listBoardsByOwnerKeys } from "@/lib/services/boardService";
import { ValidationError } from "@/lib/services/errors";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";
import { VISIBILITY_VALUES } from "@/lib/constants";
import type { Visibility } from "@/lib/types";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rateLimit = await checkRateLimit(ip, RATE_LIMITS.createBoard);
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  const data = (body ?? {}) as Record<string, unknown>;
  const visibility = VISIBILITY_VALUES.includes(data.visibility as Visibility)
    ? (data.visibility as Visibility)
    : "unlisted";

  try {
    const board = await createBoard({
      title: typeof data.title === "string" ? data.title : "",
      description: typeof data.description === "string" ? data.description : undefined,
      theme: typeof data.theme === "string" ? data.theme : undefined,
      visibility,
      nickname: typeof data.nickname === "string" ? data.nickname : undefined,
    });
    return NextResponse.json({ board }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[boards] 생성 실패:", error);
    return NextResponse.json({ error: "보드를 만들지 못했어요." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const ownerKeysParam = request.nextUrl.searchParams.get("ownerKeys") ?? "";
  const ownerKeys = ownerKeysParam
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  if (ownerKeys.length === 0) return NextResponse.json({ boards: [] });

  try {
    const boards = await listBoardsByOwnerKeys(ownerKeys);
    return NextResponse.json({ boards });
  } catch (error) {
    console.error("[boards] 목록 조회 실패:", error);
    return NextResponse.json({ error: "내 보드를 불러오지 못했어요." }, { status: 500 });
  }
}
