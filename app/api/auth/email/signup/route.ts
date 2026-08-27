import { NextResponse, type NextRequest } from "next/server";
import { createEmailUser, validateEmailCredentials } from "@/lib/firebaseAuth";
import { upsertUserAndCreateSession } from "@/lib/session";
import { ValidationError } from "@/lib/services/errors";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";
import { LIMITS } from "@/lib/constants";

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (error) {
    // 임시 진단(§2026-08-27 프로덕션 500 조사) - 원인 확인되면 제거할 것.
    console.error("[auth] email/signup 처리 중 예외:", error);
    return NextResponse.json(
      { error: "회원가입에 실패했어요.", debug: error instanceof Error ? error.stack : String(error) },
      { status: 500 }
    );
  }
}

async function handlePost(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rateLimit = await checkRateLimit(ip, RATE_LIMITS.emailSignup);
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
  const nickname =
    typeof data.nickname === "string" ? data.nickname.trim().slice(0, LIMITS.nicknameMaxLength) : "";
  const birthYear = typeof data.birthYear === "number" && Number.isInteger(data.birthYear) ? data.birthYear : null;

  try {
    validateEmailCredentials(email, password);
    if (!nickname) throw new ValidationError("닉네임을 입력해주세요.");
    // OAuth 가입은 제공자가 출생연도를 안 줄 수도 있지만, 이메일 가입은 그
    // 정보 자체가 없어서(§계정 설계안 06) 폼에서 필수로 받는다.
    if (!birthYear || birthYear < 1900 || birthYear > new Date().getFullYear()) {
      throw new ValidationError("출생연도를 올바르게 입력해주세요.");
    }

    const { firebaseUid } = await createEmailUser(email, password);
    await upsertUserAndCreateSession("email", {
      providerId: firebaseUid,
      nickname,
      profileImageUrl: null,
      birthYear,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[auth] 이메일 회원가입 실패:", error);
    return NextResponse.json({ error: "회원가입에 실패했어요." }, { status: 500 });
  }
}
