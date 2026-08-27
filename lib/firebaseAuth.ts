import { getAuth } from "firebase-admin/auth";
import { getDb } from "./firebaseAdmin";
import { ValidationError } from "./services/errors";

// firebase-admin 앱 초기화는 lib/firebaseAdmin.ts의 getDb()에 캡슐화돼 있고
// (지연 초기화 - 모듈 로드 시점이 아니라 첫 사용 시점) 밖으로 초기화 함수 자체는
// 안 내보낸다. getAuth()가 기본 앱을 찾으려면 초기화가 먼저 일어나 있어야 하니,
// Firestore를 안 쓰더라도 getDb()를 한 번 호출해서 같은 경로로 초기화를 보장한다.
function ensureFirebaseInitialized(): void {
  getDb();
}

// 이메일/비밀번호 로그인(§계정 설계안 02)을 클라이언트 Firebase SDK 없이 서버만으로
// 구현한다 - 스푼노트는 지금까지 전부 서버 라우트+리다이렉트로만 동작해왔고
// (카카오/네이버 로그인도 동일), 여기서만 클라이언트 SDK를 새로 들이면 번들
// 무게와 아키텍처 일관성 둘 다 깨진다. 대신:
//  - 회원가입: firebase-admin의 createUser (Admin SDK가 이미 있음, 새 키 불필요)
//  - 로그인: Firebase Identity Toolkit REST(accounts:signInWithPassword)를
//    서버에서 직접 호출 - Admin SDK엔 "비밀번호 검증" API가 없어서(관리용
//    SDK라 당연함) 이 REST 호출만 FIREBASE_WEB_API_KEY 하나가 추가로 필요하다.
//    이 키는 비밀값이 아니다(Firebase 프로젝트 설정 > 일반에 그냥 노출돼 있음) -
//    그래도 서버 전용 env로만 둬서 번들에 안 실리게 한다.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export function validateEmailCredentials(email: string, password: string): void {
  if (!EMAIL_RE.test(email)) throw new ValidationError("이메일 형식이 올바르지 않아요.");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`);
  }
}

export interface CreateEmailUserResult {
  firebaseUid: string;
}

export async function createEmailUser(email: string, password: string): Promise<CreateEmailUserResult> {
  ensureFirebaseInitialized();
  try {
    const record = await getAuth().createUser({ email, password });
    return { firebaseUid: record.uid };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "auth/email-already-exists") throw new ValidationError("이미 가입된 이메일이에요.");
    if (code === "auth/invalid-password") throw new ValidationError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`);
    // 로컬 검증 중 실제로 만난 에러(auth/configuration-not-found) - 이 Firebase
    // 프로젝트에 Authentication 자체가 아직 활성화 안 돼있을 때 난다(콘솔에서
    // Authentication > 시작하기 + 이메일/비밀번호 제공업체 켜야 함). 콘솔 설정
    // 문제라는 걸 로그에 명확히 남겨서 "회원가입에 실패했어요" 500만 보고
    // 원인을 못 찾는 일이 없게 한다.
    if (code === "auth/configuration-not-found") {
      console.error(
        "[firebaseAuth] 이 Firebase 프로젝트에 Authentication이 아직 활성화 안 됐어요 - " +
          "콘솔에서 Authentication > 시작하기 + 이메일/비밀번호 제공업체를 켜주세요."
      );
    }
    throw error;
  }
}

/** Identity Toolkit REST로 이메일+비밀번호를 검증하고 성공하면 Firebase uid를
 *  반환한다. 실패 이유(존재하지 않는 이메일 vs 틀린 비밀번호)는 일부러 구분해서
 *  응답하지 않는다 - 이메일 존재 여부를 노출하지 않는 게 표준적인 관행. */
export async function verifyEmailCredentials(email: string, password: string): Promise<string | null> {
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error("FIREBASE_WEB_API_KEY가 설정되지 않았어요.");

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    }
  );

  if (!res.ok) return null; // INVALID_LOGIN_CREDENTIALS / EMAIL_NOT_FOUND 등 - 전부 "실패"로만 취급
  const data = (await res.json()) as { localId?: string };
  return data.localId ?? null;
}
