import { describe, expect, it } from "vitest";
import { extractRegion, dominantRegion } from "./region";

describe("extractRegion", () => {
  it("구로 끝나는 토큰을 우선 뽑는다", () => {
    expect(extractRegion("서울 강남구 테헤란로 123")).toBe("강남구");
  });

  it("시/구가 같이 있으면 더 세밀한 구를 뽑는다", () => {
    expect(extractRegion("경기 성남시 분당구 판교역로 1")).toBe("분당구");
  });

  it("군으로 끝나는 토큰도 뽑는다", () => {
    expect(extractRegion("전남 순천시 ...")).toBe("순천시");
    expect(extractRegion("경기 양평군 ...")).toBe("양평군");
  });

  it("구/군이 없으면 시로 끝나는 토큰을 뽑는다", () => {
    expect(extractRegion("제주 제주시 노형동 123")).toBe("제주시");
  });

  it("구/군/시 토큰이 전혀 없으면 첫 토큰을 그대로 쓴다", () => {
    expect(extractRegion("세종 나성동 123")).toBe("세종");
  });

  it("주소가 없으면 null", () => {
    expect(extractRegion(undefined)).toBeNull();
    expect(extractRegion("")).toBeNull();
  });
});

describe("dominantRegion", () => {
  it("가장 많이 나오는 지역을 고른다", () => {
    const entries = [
      { address: "서울 강남구 A" },
      { address: "서울 강남구 B" },
      { address: "서울 서초구 C" },
    ];
    expect(dominantRegion(entries)).toBe("강남구");
  });

  it("주소가 아예 없는 엔트리는 무시한다", () => {
    const entries = [{ address: undefined }, { address: "서울 강남구 A" }];
    expect(dominantRegion(entries)).toBe("강남구");
  });

  it("전부 주소가 없으면 null", () => {
    expect(dominantRegion([{ address: undefined }])).toBeNull();
  });
});
