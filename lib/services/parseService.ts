import { parsers } from "../parsers";
import { fetchWithTimeout } from "../parsers/http";
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
  place_name: string;
  address_name: string;
  x: string; // lng
  y: string; // lat
  category_name?: string;
}

/** 공백/대소문자 차이를 무시하고 한쪽이 다른 쪽 이름을 포함하는지 본다. */
function matchesPlaceName(candidateName: string, targetName: string): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase();
  const candidate = normalize(candidateName);
  const target = normalize(targetName);
  if (!candidate || !target) return false;
  return candidate.includes(target) || target.includes(candidate);
}

async function enrichWithKakaoLocal(place: ParsedPlace): Promise<ParsedPlace | null> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({ query: place.placeName, size: "5" });
  const res = await fetchWithTimeout(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
  });
  if (!res || !res.ok) return null;

  try {
    const data = (await res.json()) as { documents: KakaoLocalDocument[] };
    // 검색 결과 중 이름이 실제로 일치하는 후보만 채택 - 엉뚱한 동명 다른 지점의
    // 좌표를 잘못 붙이는 것보다는, 후보를 못 고르면 좌표 없이 두고 사용자가
    // 직접 채우게(수동 폴백) 하는 편이 안전하다.
    const match = data.documents.find((doc) => matchesPlaceName(doc.place_name, place.placeName));
    if (!match) return null;

    return {
      ...place,
      address: place.address ?? match.address_name,
      lat: place.lat ?? Number(match.y),
      lng: place.lng ?? Number(match.x),
      category: place.category ?? match.category_name,
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

  const res = await fetchWithTimeout("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName",
    },
    body: JSON.stringify({ textQuery: place.placeName }),
  });
  if (!res || !res.ok) return null;

  try {
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
