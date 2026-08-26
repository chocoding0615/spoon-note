import { parsers } from "../parsers";
import type { ParsedPlace } from "../types";

/** 1) URL 패턴 추적 → 2) API 폴백(보강) → 실패 시 null(클라이언트가 수동 입력으로 폴백) */
export async function parseUrl(url: string): Promise<ParsedPlace | null> {
  const parser = parsers.find((p) => p.canHandle(url));
  if (!parser) return null;

  let result: ParsedPlace | null;
  try {
    result = await parser.parse(url);
  } catch {
    result = null;
  }
  if (!result) return null;

  if (!result.address || result.lat === undefined || result.lng === undefined) {
    result = await enrich(result);
  }

  return result;
}

async function enrich(place: ParsedPlace): Promise<ParsedPlace> {
  if (place.source === "naver" || place.source === "kakao") {
    return (await enrichWithKakaoLocal(place)) ?? place;
  }
  if (place.source === "google") {
    return (await enrichWithGooglePlaces(place)) ?? place;
  }
  return place;
}

interface KakaoLocalDocument {
  address_name: string;
  x: string; // lng
  y: string; // lat
  category_name?: string;
}

async function enrichWithKakaoLocal(place: ParsedPlace): Promise<ParsedPlace | null> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({ query: place.placeName, size: "1" });
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { documents: KakaoLocalDocument[] };
    const doc = data.documents[0];
    if (!doc) return null;

    return {
      ...place,
      address: place.address ?? doc.address_name,
      lat: place.lat ?? Number(doc.y),
      lng: place.lng ?? Number(doc.x),
      category: place.category ?? doc.category_name,
    };
  } catch {
    return null;
  }
}

interface GooglePlace {
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  primaryTypeDisplayName?: { text: string };
}

async function enrichWithGooglePlaces(place: ParsedPlace): Promise<ParsedPlace | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName",
      },
      body: JSON.stringify({ textQuery: place.placeName }),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { places?: GooglePlace[] };
    const first = data.places?.[0];
    if (!first) return null;

    return {
      ...place,
      placeName: place.placeName || first.displayName?.text || place.placeName,
      address: place.address ?? first.formattedAddress,
      lat: place.lat ?? first.location?.latitude,
      lng: place.lng ?? first.location?.longitude,
      category: place.category ?? first.primaryTypeDisplayName?.text,
    };
  } catch {
    return null;
  }
}
