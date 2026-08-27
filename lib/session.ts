import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import type { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./firebaseAdmin";

// chemi-map(C:\Users\admin\chemi-map)의 lib/session.ts를 그대로 이식한 구조 -
// JWT가 아니라 Firestore 문서 기반 세션 토큰(로그아웃 시 문서 삭제로 즉시
// 무효화 가능)이라 이미 Firestore를 쓰는 스푼노트와 궁합이 좋다. 쿠키 이름/
// 컬렉션 이름만 스푼노트 네이밍으로 바꿨고 나머지 로직은 동일.
const SESSION_COOKIE = "spoonnote_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

export type Provider = "kakao" | "naver" | "email";

export interface SessionUser {
  uid: string;
  provider: Provider;
  nickname: string;
  profileImageUrl: string | null;
  /** 만 14세 미만 커뮤니티 이용 제한(§프롬프트 9 요구사항 4)에 쓴다. 제공자
   *  동의를 안 받았거나 값이 없으면 null - 호출부가 "연령 미상"으로 취급해야 함. */
  birthYear: number | null;
  createdAt: string;
}

export interface OAuthProfile {
  providerId: string;
  nickname: string;
  profileImageUrl: string | null;
  /** 카카오 "생년"/네이버 "출생연도" 동의항목 - 미동의/미제공 시 null.
   *  age_range 같은 "범위"값은 만 14세 미만을 정확히 가려낼 수 없어서
   *  일부러 요청하지 않는다(§설계안 06). */
  birthYear: number | null;
}

export function makeUid(provider: Provider, providerId: string): string {
  return `${provider}_${providerId}`;
}

export async function upsertUserAndCreateSession(provider: Provider, profile: OAuthProfile): Promise<string> {
  const uid = makeUid(provider, profile.providerId);
  const db = getDb();
  const userRef = db.collection("users").doc(uid);
  const now = new Date();
  const existing = await userRef.get();

  // 이번 로그인에서 동의를 안 받았다고 이전에 받아둔 출생연도를 지우면 안 되니,
  // 값이 왔을 때만 필드를 갱신한다(merge 대상에서 아예 빼는 방식) - chemi-map의
  // ageRange 처리와 동일한 원칙.
  const birthYearUpdate = profile.birthYear ? { birthYear: profile.birthYear } : {};

  if (existing.exists) {
    await userRef.update({
      nickname: profile.nickname,
      profileImageUrl: profile.profileImageUrl,
      lastLoginAt: now,
      ...birthYearUpdate,
    });
  } else {
    await userRef.set({
      provider,
      providerId: profile.providerId,
      nickname: profile.nickname,
      profileImageUrl: profile.profileImageUrl,
      createdAt: now,
      lastLoginAt: now,
      ...birthYearUpdate,
    });
  }

  await createSessionCookie(uid);
  return uid;
}

/** 세션 문서 생성 + 쿠키 설정만 분리 - 이메일 로그인(§/api/auth/email/session)도
 *  users upsert 방식이 OAuth와 달라서 이 부분만 공유한다. */
export async function createSessionCookie(uid: string): Promise<void> {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await getDb().collection("sessions").doc(token).set({ uid, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const sessionSnap = await db.collection("sessions").doc(token).get();
  if (!sessionSnap.exists) return null;

  const sessionData = sessionSnap.data() as { uid: string; expiresAt: Timestamp | Date };
  const expiresAt = sessionData.expiresAt instanceof Date ? sessionData.expiresAt : sessionData.expiresAt.toDate();
  if (expiresAt.getTime() < Date.now()) {
    await sessionSnap.ref.delete();
    return null;
  }

  const userSnap = await db.collection("users").doc(sessionData.uid).get();
  if (!userSnap.exists) return null;
  const user = userSnap.data() as {
    provider: Provider;
    nickname: string;
    profileImageUrl: string | null;
    birthYear?: number;
    createdAt?: Timestamp | Date;
  };
  const createdAt = user.createdAt
    ? user.createdAt instanceof Date
      ? user.createdAt
      : user.createdAt.toDate()
    : new Date();

  return {
    uid: sessionData.uid,
    provider: user.provider,
    nickname: user.nickname,
    profileImageUrl: user.profileImageUrl,
    birthYear: user.birthYear ?? null,
    createdAt: createdAt.toISOString(),
  };
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().collection("sessions").doc(token).delete();
  }
  cookieStore.delete(SESSION_COOKIE);
}

const OAUTH_STATE_COOKIE = "spoonnote_oauth_state";
const OAUTH_STATE_MAX_AGE_SECONDS = 600;

export async function createOAuthState(provider: Provider): Promise<string> {
  const state = generateToken();
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, `${provider}:${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });
  return state;
}

export async function verifyOAuthState(provider: Provider, state: string | null): Promise<boolean> {
  const cookieStore = await cookies();
  const stored = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);
  if (!stored || !state) return false;
  return stored === `${provider}:${state}`;
}

/** 만 14세 미만 커뮤니티 이용 제한 판정(설계안 §06 A안 - 안전 우선).
 *  출생연도를 모르면(동의 안 함 등) "연령 미상"으로 간주해 미성년자와 동일하게
 *  차단한다 - 우선 허용(B안)보다 마찰은 있지만 보호 원칙에 안전한 쪽. */
export function isBelowMinAge(birthYear: number | null, minAge = 14): boolean {
  if (birthYear === null) return true;
  const currentYear = new Date().getFullYear();
  return currentYear - birthYear < minAge;
}
