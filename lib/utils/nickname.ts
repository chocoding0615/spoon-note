import { NICKNAME_STORAGE_KEY } from "../constants";

/** 커뮤니티공개로 보드를 만들 때 정한 닉네임을 브라우저에 기억해둔다 - 계정이
 *  없는 앱이라 "재사용"의 실체는 이 localStorage 값뿐이다. 서버(Board.nickname)
 *  에는 보드별로 그 시점의 값을 스냅샷처럼 저장하고, 여기 값은 다음 보드를
 *  만들 때 입력창을 미리 채우는 용도로만 쓴다. */
export function saveNickname(nickname: string): void {
  try {
    localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
  } catch {
    // 닉네임 재사용만 못 하게 될 뿐, 나머지 기능엔 영향 없음
  }
}

export function getNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}
