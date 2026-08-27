const EARTH_RADIUS_METERS = 6_371_000;

/** 두 좌표 사이의 대권거리(km 단위 근사가 아니라 미터, 위경도 기반 구면 거리).
 *  matching.ts의 근접 매칭과 별개 용도(그쪽은 "같은 장소인지" 판정, 이건 "몇 미터
 *  떨어져 있는지" 정렬용)라 반환 단위와 정밀도 요구가 달라 함수를 공유하지 않는다. */
export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}
