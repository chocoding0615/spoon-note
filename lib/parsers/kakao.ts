import type { ParsedPlace } from "../types";
import type { PlaceParser } from "./types";
import { resolveFinalUrl, fetchHtml, extractMeta } from "./http";

function canHandle(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "kko.to" || hostname.endsWith(".kakao.com");
  } catch {
    return false;
  }
}

async function parse(url: string): Promise<ParsedPlace | null> {
  const finalUrl = await resolveFinalUrl(url);
  if (!finalUrl) return null;

  const html = await fetchHtml(finalUrl);
  if (!html) return null;

  const rawTitle = extractMeta(html, "og:title");
  if (!rawTitle) return null;

  return {
    source: "kakao",
    placeName: cleanPlaceName(rawTitle),
    address: extractMeta(html, "og:description"),
    sourceUrl: finalUrl,
  };
}

function cleanPlaceName(raw: string): string {
  return raw.replace(/\s*[-|]\s*카카오\s*맵.*$/i, "").trim();
}

export const kakaoParser: PlaceParser = { source: "kakao", canHandle, parse };
