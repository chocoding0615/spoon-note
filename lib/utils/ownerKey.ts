import { useSyncExternalStore } from "react";
import { OWNER_KEY_STORAGE_PREFIX } from "../constants";

/** 브라우저 전용 - localStorage 접근 불가 환경(시크릿 모드 등)에서도 조용히 실패한다. */
export function saveOwnerKey(slug: string, ownerKey: string): void {
  try {
    localStorage.setItem(OWNER_KEY_STORAGE_PREFIX + slug, ownerKey);
  } catch {
    // 소유자 전용 기능만 못 쓰게 될 뿐, 나머지 기능엔 영향 없음
  }
}

export function getOwnerKey(slug: string): string | null {
  try {
    return localStorage.getItem(OWNER_KEY_STORAGE_PREFIX + slug);
  } catch {
    return null;
  }
}

export function removeOwnerKey(slug: string): void {
  try {
    localStorage.removeItem(OWNER_KEY_STORAGE_PREFIX + slug);
  } catch {
    // ignore
  }
}

export interface OwnedBoard {
  slug: string;
  ownerKey: string;
}

/** 보드마다 ownerKey가 개별 발급되므로(계정 개념 없음), 로컬에 저장된
 *  slug/ownerKey 쌍을 전부 훑어서 "내 보드" 목록을 구성한다. */
export function listOwnedBoards(): OwnedBoard[] {
  try {
    const result: OwnedBoard[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(OWNER_KEY_STORAGE_PREFIX)) continue;
      const ownerKey = localStorage.getItem(key);
      if (!ownerKey) continue;
      result.push({ slug: key.slice(OWNER_KEY_STORAGE_PREFIX.length), ownerKey });
    }
    return result;
  } catch {
    return [];
  }
}

let cachedSnapshot: OwnedBoard[] = [];
let cachedSnapshotKey = "";

// localStorage read를 useEffect+setState로 동기화하면 렌더 직후 추가 렌더가
// 한 번 더 발생한다(react-hooks/set-state-in-effect가 지적하는 패턴) - 대신
// useSyncExternalStore로 렌더 중에 직접 구독한다. getSnapshot이 매번 새
// 배열을 만들면 무한 루프 위험이 있어 내용이 실제로 바뀔 때만 새로 만든다.
function getSnapshot(): OwnedBoard[] {
  const boards = listOwnedBoards();
  const key = JSON.stringify(boards);
  if (key !== cachedSnapshotKey) {
    cachedSnapshotKey = key;
    cachedSnapshot = boards;
  }
  return cachedSnapshot;
}

function getServerSnapshot(): OwnedBoard[] {
  return [];
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

/** 클라이언트 컴포넌트에서 localStorage에 저장된 "내 보드" 목록을 안전하게 구독한다. */
export function useOwnedBoards(): OwnedBoard[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
