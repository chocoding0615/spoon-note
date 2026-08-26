import { randomBytes } from "node:crypto";

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"; // 0/1/l/o 등 헷갈리는 문자 제외

/** 짧은 URL-safe slug 생성 (기본 8자, 공유 URL /b/[slug]용) */
export function generateSlug(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
