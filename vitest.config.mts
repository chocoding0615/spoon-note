import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// .env.local을 여기서도 읽어야 canonicalPlaceService의 통합 테스트가 실제
// Firestore 프로젝트에 붙을 수 있다(별도 테스트용 프로젝트는 아직 없음).
// Next.js의 .env 파싱과 동일한 최소 구현 - 외부 dotenv 패키지는 새로 안 씀.
function loadDotEnvLocal(): Record<string, string> {
  try {
    const raw = readFileSync(".env.local", "utf-8");
    const env: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      let value = match[2];
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      env[match[1]] = value;
    }
    return env;
  } catch {
    return {};
  }
}

export default defineConfig({
  test: {
    environment: "node",
    env: loadDotEnvLocal(),
  },
});
