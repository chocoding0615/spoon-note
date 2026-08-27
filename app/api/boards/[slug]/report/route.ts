import { NextResponse, type NextRequest } from "next/server";
import { reportBoard } from "@/lib/services/reportService";
import { NotFoundError } from "@/lib/services/errors";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;

  const ip = getClientIp(request.headers);
  const rateLimit = await checkRateLimit(ip, RATE_LIMITS.report);
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

  try {
    await reportBoard(slug);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("[boards] 신고 처리 실패:", error);
    return NextResponse.json({ error: "신고를 접수하지 못했어요." }, { status: 500 });
  }
}
