import { describe, expect, it } from "vitest";
import { decideMatch, extractPlaceId, haversineDistanceMeters, nameSimilarity } from "./matching";

describe("extractPlaceId", () => {
  it("네이버 sourceUrl에서 place ID를 뽑는다", () => {
    expect(extractPlaceId("naver", "https://m.place.naver.com/place/12345")).toBe("12345");
    expect(extractPlaceId("naver", "https://map.naver.com/p/entry/place/67890")).toBe("67890");
  });

  it("카카오 sourceUrl에서 place ID를 뽑는다", () => {
    expect(extractPlaceId("kakao", "https://place.map.kakao.com/8098381")).toBe("8098381");
  });

  it("구글/manual은 안정적인 ID가 없어 항상 null", () => {
    expect(extractPlaceId("google", "https://www.google.com/maps/place/foo/@1,1,1z")).toBeNull();
    expect(extractPlaceId("manual", undefined)).toBeNull();
  });

  it("URL 형식이 안 맞으면 null", () => {
    expect(extractPlaceId("naver", "https://map.naver.com/p/entry/folder/999")).toBeNull();
    expect(extractPlaceId("kakao", "https://kakao.com/")).toBeNull();
  });

  it("sourceUrl 자체가 없으면 null", () => {
    expect(extractPlaceId("naver", undefined)).toBeNull();
    expect(extractPlaceId("naver", "")).toBeNull();
  });
});

describe("haversineDistanceMeters", () => {
  it("같은 좌표는 거리 0", () => {
    expect(haversineDistanceMeters({ lat: 37.5, lng: 127.0 }, { lat: 37.5, lng: 127.0 })).toBeCloseTo(0, 3);
  });

  it("서울-부산처럼 먼 거리는 수백km 단위로 나온다", () => {
    const seoul = { lat: 37.5665, lng: 126.978 };
    const busan = { lat: 35.1796, lng: 129.0756 };
    const distance = haversineDistanceMeters(seoul, busan);
    expect(distance).toBeGreaterThan(300000);
    expect(distance).toBeLessThan(340000);
  });

  it("50m 반경 판정에 쓸 만큼 짧은 거리도 정확하다(약 0.0005도 ≈ 55m)", () => {
    const a = { lat: 37.5, lng: 127.0 };
    const b = { lat: 37.5005, lng: 127.0 };
    const distance = haversineDistanceMeters(a, b);
    expect(distance).toBeGreaterThan(45);
    expect(distance).toBeLessThan(65);
  });
});

describe("nameSimilarity", () => {
  it("완전히 같으면 1", () => {
    expect(nameSimilarity("청포도집", "청포도집")).toBe(1);
  });

  it("공백/기호 차이는 흡수한다", () => {
    expect(nameSimilarity("스타벅스 강남점", "스타벅스강남점")).toBe(1);
  });

  it("표기 차이가 조금 있으면 1보다 작지만 높은 유사도", () => {
    const similarity = nameSimilarity("스타벅스 강남점", "스타벅스 강남 DT점");
    expect(similarity).toBeGreaterThan(0.5);
    expect(similarity).toBeLessThan(1);
  });

  it("완전히 다른 이름은 유사도가 낮다", () => {
    expect(nameSimilarity("청포도집", "맥도날드 시청점")).toBeLessThan(0.3);
  });

  it("빈 문자열은 유사도 0", () => {
    expect(nameSimilarity("", "청포도집")).toBe(0);
  });
});

describe("decideMatch", () => {
  const kakaoCandidate = {
    id: "canonical-1",
    placeName: "청포도집",
    lat: 37.40185,
    lng: 127.22022,
    sources: [{ source: "kakao" as const, placeId: "8098381" }],
  };

  it("같은 소스 + 같은 placeId면 좌표/이름과 무관하게 정확 매칭", () => {
    const target = {
      source: "kakao" as const,
      placeId: "8098381",
      placeName: "완전히 다른 이름이어도",
      lat: 0,
      lng: 0,
    };
    expect(decideMatch(target, [kakaoCandidate])?.id).toBe("canonical-1");
  });

  it("다른 서비스지만 좌표 50m 이내 + 이름 유사하면 근사 매칭", () => {
    const target = {
      source: "naver" as const,
      placeId: "99999", // 네이버 쪽 자체 ID - 카카오 후보와는 다름(정확 매칭 대상 아님)
      placeName: "청포도집",
      lat: 37.40186, // kakaoCandidate와 거의 동일 좌표(수 미터 차이)
      lng: 127.22023,
    };
    expect(decideMatch(target, [kakaoCandidate])?.id).toBe("canonical-1");
  });

  it("좌표는 가까워도 이름이 완전히 다르면 매칭 안 함(오탐 방지 우선)", () => {
    const target = {
      source: "naver" as const,
      placeId: null,
      placeName: "완전히 다른 가게",
      lat: 37.40186,
      lng: 127.22023,
    };
    expect(decideMatch(target, [kakaoCandidate])).toBeNull();
  });

  it("이름은 같아도 반경(50m) 밖이면 매칭 안 함", () => {
    const target = {
      source: "naver" as const,
      placeId: null,
      placeName: "청포도집",
      lat: 37.41, // kakaoCandidate에서 약 1km 이상 떨어짐
      lng: 127.22022,
    };
    expect(decideMatch(target, [kakaoCandidate])).toBeNull();
  });

  it("좌표가 아예 없으면(수동 입력 등) 근사 매칭 자체를 시도하지 않고 별개로 둔다", () => {
    const target = { source: "manual" as const, placeId: null, placeName: "청포도집" };
    expect(decideMatch(target, [kakaoCandidate])).toBeNull();
  });

  it("후보가 없으면 항상 null", () => {
    const target = { source: "kakao" as const, placeId: "8098381", placeName: "청포도집", lat: 0, lng: 0 };
    expect(decideMatch(target, [])).toBeNull();
  });

  it("여러 후보 중 유사도가 가장 높은 쪽으로 매칭", () => {
    const closeButLessSimilar = {
      id: "canonical-2",
      placeName: "청포도찻집", // 유사도는 있지만 낮음
      lat: 37.40185,
      lng: 127.22022,
      sources: [{ source: "google" as const, placeId: "irrelevant" }],
    };
    const target = {
      source: "naver" as const,
      placeId: null,
      placeName: "청포도집",
      lat: 37.40185,
      lng: 127.22022,
    };
    expect(decideMatch(target, [closeButLessSimilar, kakaoCandidate])?.id).toBe("canonical-1");
  });
});
