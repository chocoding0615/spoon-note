import { ValidationError } from "./services/errors";

// 이메일/비밀번호 로그인(§계정 설계안 02)을 클라이언트 Firebase SDK 없이 서버만으로
// 구현한다 - 스푼노트는 지금까지 전부 서버 라우트+리다이렉트로만 동작해왔고
// (카카오/네이버 로그인도 동일), 여기서만 클라이언트 SDK를 새로 들이면 번들
// 무게와 아키텍처 일관성 둘 다 깨진다.
//
// 회원가입/로그인 둘 다 firebase-admin의 Auth 모듈이 아니라 Identity Toolkit
// REST를 직접 호출한다 - 처음엔 회원가입만 firebase-admin의 getAuth().createUser()를
// 썼는데, "firebase-admin/auth"를 import하는 것만으로 그 내부 의존성인
// jwks-rsa -> jose(ESM 전용)가 같이 로드되면서 Vercel 배포에서
// "Error [ERR_REQUIRE_ESM]"로 이 파일을 쓰는 라우트 전부가 500이 났다(로컬
// dev/next start/Node 버전 올리기 전부 재현 안 됨 - Next.js가 firebase-admin을
// 기본으로 external 처리하면서 자기 로더로 require()하는 과정에서만 터짐,
// 2026-08-27 확인). Admin SDK를 아예 안 쓰면 이 문제 자체가 사라진다.
// FIREBASE_WEB_API_KEY는 비밀값이 아니다(Firebase 콘솔 > 프로젝트 설정 > 일반에
// 그냥 노출돼 있음) - 그래도 서버 전용 env로만 둬서 클라이언트 번들엔 안 실리게 한다.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export function validateEmailCredentials(email: string, password: string): void {
  if (!EMAIL_RE.test(email)) throw new ValidationError("이메일 형식이 올바르지 않아요.");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`);
  }
}

interface IdentityToolkitErrorBody {
  error?: { message?: string };
}

function getApiKeyOrThrow(): string {
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error("FIREBASE_WEB_API_KEY가 설정되지 않았어요.");
  return apiKey;
}

/** Firebase 프로젝트에 Authentication 자체가 아직 활성화 안 됐을 때(콘솔에서
 *  Authentication > 시작하기 + 이메일/비밀번호 제공업체를 켜야 함) Identity
 *  Toolkit이 이 코드를 돌려준다 - "회원가입/로그인 실패" 500만 보고 원인을
 *  못 찾는 일이 없게 로그에 명확히 남긴다. */
function warnIfAuthNotConfigured(code: string): void {
  if (code !== "CONFIGURATION_NOT_FOUND") return;
  console.error(
    "[firebaseAuth] 이 Firebase 프로젝트에 Authentication이 아직 활성화 안 됐어요 - " +
      "콘솔에서 Authentication > 시작하기 + 이메일/비밀번호 제공업체를 켜주세요."
  );
}

export interface CreateEmailUserResult {
  firebaseUid: string;
}

export async function createEmailUser(email: string, password: string): Promise<CreateEmailUserResult> {
  const apiKey = getApiKeyOrThrow();

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as IdentityToolkitErrorBody | null;
    const code = data?.error?.message ?? "";
    if (code === "EMAIL_EXISTS") throw new ValidationError("이미 가입된 이메일이에요.");
    warnIfAuthNotConfigured(code);
    throw new Error(`이메일 회원가입 실패: ${code || res.status}`);
  }

  const data = (await res.json()) as { localId?: string };
  if (!data.localId) throw new Error("이메일 회원가입 실패: 응답에 localId가 없어요.");
  return { firebaseUid: data.localId };
}

/** Identity Toolkit REST로 이메일+비밀번호를 검증하고 성공하면 Firebase uid를
 *  반환한다. 실패 이유(존재하지 않는 이메일 vs 틀린 비밀번호)는 일부러 구분해서
 *  응답하지 않는다 - 이메일 존재 여부를 노출하지 않는 게 표준적인 관행. */
export async function verifyEmailCredentials(email: string, password: string): Promise<string | null> {
  const apiKey = getApiKeyOrThrow();

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    }
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as IdentityToolkitErrorBody | null;
    warnIfAuthNotConfigured(data?.error?.message ?? "");
    return null; // INVALID_LOGIN_CREDENTIALS / EMAIL_NOT_FOUND 등 - 전부 "실패"로만 취급
  }
  const data = (await res.json()) as { localId?: string };
  return data.localId ?? null;
}
