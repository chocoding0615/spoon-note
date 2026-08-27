export class ValidationError extends Error {}

export class OwnershipError extends Error {
  constructor(message = "권한이 없어요.") {
    super(message);
  }
}

export class NotFoundError extends Error {}

/** 로그인이 필요한 동작(예: "커뮤니티공개" 전환)을 비로그인 상태로 시도했을 때. */
export class AuthRequiredError extends Error {
  constructor(message = "로그인이 필요해요.") {
    super(message);
  }
}

/** 연령 확인 결과 커뮤니티 기능 이용이 제한될 때(§세션 설계안 06 A안 - 안전 우선,
 *  출생연도 미상도 미성년자와 동일하게 취급). */
export class AgeRestrictedError extends Error {
  constructor(message = "만 14세 미만이거나 연령 확인이 안 돼서 커뮤니티 기능을 쓸 수 없어요.") {
    super(message);
  }
}
