import { NextResponse, type NextRequest } from "next/server";
import { verifyEmailCredentials } from "@/lib/firebaseAuth";
import { createSessionCookie, makeUid } from "@/lib/session";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rateLimit = await checkRateLimit(ip, RATE_LIMITS.emailLogin);
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
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "이메일과 비밀번호를 입력해주세요." }, { status: 400 });
  }

  try {
    const firebaseUid = await verifyEmailCredentials(email, password);
    // 존재하지 않는 이메일인지 비밀번호가 틀렸는지 구분해서 알려주지 않는다 -
    // 이메일 존재 여부 자체를 노출하지 않는 게 표준적인 관행.
    if (!firebaseUid) {
      return NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않아요." }, { status: 401 });
    }
    await createSessionCookie(makeUid("email", firebaseUid));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[auth] 이메일 로그인 실패:", error);
    return NextResponse.json({ error: "로그인에 실패했어요." }, { status: 500 });
  }
}
