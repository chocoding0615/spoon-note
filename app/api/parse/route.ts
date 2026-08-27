import { NextResponse, type NextRequest } from "next/server";
import { parseUrl } from "@/lib/services/parseService";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";
import { isSafeUrl } from "@/lib/parsers/http";
import type { ParseResponse } from "@/lib/types";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rateLimit = await checkRateLimit(ip, RATE_LIMITS.parse);
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

  const rawUrl = (body as { url?: unknown } | null)?.url;
  const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!url || !isSafeUrl(url)) {
    return NextResponse.json({ error: "지원하지 않는 링크예요." }, { status: 400 });
  }

  // 단축링크 리다이렉트 추적 등 외부 네트워크 왕복이 낀 작업이라 일시적인 실패에
  // 취약하다(§import-list route와 동일한 이유, 2026-08-28 재현) - 한 번 재시도.
  let parsed = await parseUrl(url).catch(() => null);
  if (!parsed) parsed = await parseUrl(url).catch(() => null);

  return NextResponse.json({ parsed } satisfies ParseResponse);
}
