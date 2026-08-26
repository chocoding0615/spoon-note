import type { ParsedPlace } from "../types";
import type { PlaceParser } from "./types";
import { resolveFinalUrl, fetchHtml, extractMeta } from "./http";

function canHandle(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "naver.me" || hostname.endsWith(".naver.com");
  } catch {
    return false;
  }
}

async function parse(url: string): Promise<ParsedPlace | null> {
  // 실측 확인(2026-08-26): map.naver.com은 og:title 없는 SPA 껍데기만 내려주고,
  // m.place.naver.com은 서버 요청(curl UA 등)에 캡차(ncaptcha) 스텁 페이지를
  // 돌려줌 - 브라우저에서만 정상 동작. 그래서 아래는 대부분 null을 반환하며,
  // 클라이언트가 자동으로 수동 입력 모드로 폴백한다(의도된 동작).
  const finalUrl = await resolveFinalUrl(url);
  if (!finalUrl) return null;

  const html = await fetchHtml(finalUrl);
  if (!html) return null;

  const rawTitle = extractMeta(html, "og:title");
  if (!rawTitle) return null;

  return {
    source: "naver",
    placeName: cleanPlaceName(rawTitle),
    address: extractMeta(html, "og:description"),
    sourceUrl: finalUrl,
  };
}

function cleanPlaceName(raw: string): string {
  return raw.replace(/\s*[:|]\s*네이버\s*지도.*$/i, "").trim();
}

export const naverParser: PlaceParser = { source: "naver", canHandle, parse };
