import { describe, expect, it } from "vitest";
import { isBelowMinAge } from "./session";

describe("isBelowMinAge", () => {
  const currentYear = new Date().getFullYear();

  it("출생연도가 없으면(연령 미상) 미성년자와 동일하게 취급한다(안전 우선)", () => {
    expect(isBelowMinAge(null)).toBe(true);
  });

  it("만 14세 미만이면 true", () => {
    expect(isBelowMinAge(currentYear - 13)).toBe(true);
    expect(isBelowMinAge(currentYear - 1)).toBe(true);
  });

  it("만 14세 이상이면 false", () => {
    expect(isBelowMinAge(currentYear - 14)).toBe(false);
    expect(isBelowMinAge(currentYear - 30)).toBe(false);
  });
});
