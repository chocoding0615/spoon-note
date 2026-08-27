import type { ParsedPlace } from "../types";
import type { PlaceParser } from "./types";
import { resolveFinalUrl, isHostnameOf } from "./http";

function canHandle(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname === "maps.app.goo.gl") return true;
    // google.com만 허용(다른 국가 TLD는 배제) - 예전엔 hostname.includes("google.")
    // 라서 "www.google.com.evil.net" 같은 도메인도 통과했다(부분일치 취약점).
    if (isHostnameOf(hostname, "google.com") && pathname.includes("/maps/")) return true;
    return false;
  } catch {
    return false;
  }
}

async function parse(url: string): Promise<ParsedPlace | null> {
  const finalUrl = await resolveFinalUrl(url);
  if (!finalUrl) return null;

  const parsed = new URL(finalUrl);
  const placeSegment = parsed.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
  const placeName = placeSegment ? decodeURIComponent(placeSegment.replace(/\+/g, " ")) : undefined;

  const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);

  if (!placeName) return null; // 이름을 못 얻으면 수동 입력 폴백으로 넘긴다

  return {
    source: "google",
    placeName,
    lat: coordMatch ? Number(coordMatch[1]) : undefined,
    lng: coordMatch ? Number(coordMatch[2]) : undefined,
    sourceUrl: finalUrl,
  };
}

export const googleParser: PlaceParser = { source: "google", canHandle, parse };
