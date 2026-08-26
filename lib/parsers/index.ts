import type { PlaceParser } from "./types";
import { naverParser } from "./naver";
import { kakaoParser } from "./kakao";
import { googleParser } from "./google";

// 새 소스 추가 = 파일 하나 + 이 배열에 한 줄 등록
export const parsers: PlaceParser[] = [naverParser, kakaoParser, googleParser];
