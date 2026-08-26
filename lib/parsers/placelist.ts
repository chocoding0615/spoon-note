import type { ParsedPlace, PlaceSource } from "../types";
import { resolveFinalUrl } from "./http";

/** 폴더(저장 목록) 파서(naverPlacelist/googlePlacelist/kakaoPlacelist)의 공통 반환 형태.
 *  단일 링크 파서(PlaceParser, URL 하나 → 장소 하나)와는 반환 형태 자체가 달라서
 *  기존 레지스트리(`./index.ts`)엔 안 끼워 넣는다. */
export interface PlacelistResult {
  places: ParsedPlace[];
  /** 최선으로 파악한 총 개수 - 일부 소스는 파서 내부 상한(예: 네이버 페이지네이션
   *  200개 캡) 때문에 실제 폴더 크기보다 작을 수 있다. */
  totalCount: number;
  /** 끝까지 다 못 가져오고 중간에 실패해서 지금까지 모은 것만 반환한 경우 true */
  partial: boolean;
}

export type PlacelistSource = Extract<PlaceSource, "naver" | "google" | "kakao">;

export interface PlacelistDetection {
  source: PlacelistSource;
  finalUrl: string;
}

// 실측 확인(2026-08-27)한 세 서비스의 "폴더(저장 목록)" 공유 링크 최종 URL 패턴.
// 셋 다 단축링크(naver.me/kko.to/maps.app.goo.gl)를 리다이렉트 추적해야 구분되고,
// 이 최종 URL 패턴은 개별 장소 링크와는 겹치지 않는다(개별 장소는 /favorite/
// myPlace/folder/, /maps/placelists/, folderid+page=bookmark 어디에도 안 걸림).
export async function detectPlacelist(url: string): Promise<PlacelistDetection | null> {
  const finalUrl = await resolveFinalUrl(url);
  if (!finalUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(finalUrl);
  } catch {
    return null;
  }

  if (parsed.hostname.endsWith("naver.com") && parsed.pathname.includes("/favorite/myPlace/folder/")) {
    return { source: "naver", finalUrl };
  }
  // 구글은 UA에 따라 최종 URL 모양이 갈린다(실측 확인) - 브라우저 UA는
  // `/maps/placelists/list/{id}`로 바로 가지만, 이 프로젝트가 리다이렉트 추적에
  // 쓰는 봇 UA(`resolveFinalUrl`의 BOT_USER_AGENT)는 한 홉 더 튀어서
  // `/maps/@/data=...!11m1!2s{id}` 형태로 도착한다. 둘 다 잡아야 한다.
  if (
    parsed.hostname.includes("google.") &&
    (parsed.pathname.includes("/maps/placelists/") || /\/maps\/@\/data=.*!11m1!2s/.test(parsed.pathname))
  ) {
    return { source: "google", finalUrl };
  }
  if (
    parsed.hostname === "map.kakao.com" &&
    parsed.searchParams.get("page") === "bookmark" &&
    parsed.searchParams.has("folderid")
  ) {
    return { source: "kakao", finalUrl };
  }

  return null;
}
