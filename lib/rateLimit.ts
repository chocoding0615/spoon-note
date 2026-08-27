import { createHash } from "node:crypto";
import { getDb } from "./firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// 서버리스 환경에서는 인메모리 카운터가 인스턴스마다 따로 놀아 의미가 없으니,
// Firestore 문서 하나를 고정 시간창(fixed window) 버킷으로 쓴다.
// 문서 ID = 엔드포인트 + IP 해시 + 창 번호 구조라, 같은 창 안에서만 경합이 걸리고
// 창이 바뀌면 자연히 새 문서에서 다시 센다.

export interface RateLimitRule {
  endpoint: string;
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  /** 링크 파싱: 시간당 30회 - 정상 사용엔 충분하고 반복 크롤링만 막는 수준 */
  parse: { endpoint: "parse", limit: 30, windowMs: 60 * 60 * 1000 },
  /** 보드 생성: 시간당 10회 - 무료 한도(3개)보다 넉넉하지만 스팸은 막는 수준 */
  createBoard: { endpoint: "createBoard", limit: 10, windowMs: 60 * 60 * 1000 },
  /** 엔트리 추가: 시간당 60회 - 친구가 같이 채우는 컨셉이라 생성보다 넉넉하게 */
  addEntry: { endpoint: "addEntry", limit: 60, windowMs: 60 * 60 * 1000 },
  /** 폴더 링크 가져오기: 시간당 10회 - 호출 하나가 내부적으로 여러 번 fetch하는
   *  무거운 작업이라(네이버는 페이지네이션까지 돎) parse보다 훨씬 낮게 잡는다 */
  importList: { endpoint: "importList", limit: 10, windowMs: 60 * 60 * 1000 },
  /** 보드 신고: 시간당 20회 - 최소 기능이라 중복/스팸 신고 자체를 막진 않지만,
   *  자동화된 도배로 신고 컬렉션이 무한정 쌓이는 것만 방지하는 수준 */
  report: { endpoint: "report", limit: 20, windowMs: 60 * 60 * 1000 },
} satisfies Record<string, RateLimitRule>;

// 프록시 체인의 맨 앞이 실제 클라이언트 IP다.
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip") ?? "";
}

export interface RateLimitResult {
  ok: boolean;
  /** 차단됐을 때만 있음 - 다음 창까지 남은 초. 응답의 Retry-After 헤더로 그대로 쓴다. */
  retryAfterSeconds?: number;
}

export async function checkRateLimit(ip: string, rule: RateLimitRule): Promise<RateLimitResult> {
  // IP를 못 얻으면(프록시 설정 이상 등) 제한을 끄고 통과시킨다(fail-open).
  if (!ip) return { ok: true };

  const ipHash = createHash("sha256").update(`spoonnote:${ip}`).digest("hex").slice(0, 32);

  const now = Date.now();
  const windowKey = Math.floor(now / rule.windowMs);
  const retryAfterSeconds = Math.ceil(((windowKey + 1) * rule.windowMs - now) / 1000);

  try {
    const docRef = getDb().collection("rateLimits").doc(`${rule.endpoint}_${ipHash}_${windowKey}`);

    const allowed = await getDb().runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const data = snap.data();
      const count = typeof data?.count === "number" ? data.count : 0;
      if (count >= rule.limit) return false;
      tx.set(
        docRef,
        {
          count: count + 1,
          endpoint: rule.endpoint,
          expireAt: new Date((windowKey + 1) * rule.windowMs),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return true;
    });

    return allowed ? { ok: true } : { ok: false, retryAfterSeconds };
  } catch (error) {
    // Firestore 미설정(.env.local 없음 등)이어도 레이트리밋 때문에 기능 자체가
    // 막히면 안 되니 fail-open. 원인은 콘솔에 남겨서 설정 누락을 알아챌 수 있게 한다.
    console.error("[rateLimit] Firestore 접근 실패 - fail-open으로 통과시킴:", error);
    return { ok: true };
  }
}
