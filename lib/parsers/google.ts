import type { ParsedPlace } from "../types";
import type { PlaceParser } from "./types";
import { resolveFinalUrl } from "./http";

function canHandle(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname === "maps.app.goo.gl") return true;
    if (hostname.includes("google.") && pathname.includes("/maps/")) return true;
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
