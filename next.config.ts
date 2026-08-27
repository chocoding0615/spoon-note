import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin/auth(§lib/firebaseAuth.ts, 프롬프트 9 이메일 로그인)가 내부에
  // ESM 전용 모듈을 갖고 있어서, 번들러가 이 패키지를 직접 번들링하면
  // "Error [ERR_REQUIRE_ESM]"로 프로덕션에서만 500이 났다(로컬 dev/next start
  // 둘 다 재현 안 됨 - Vercel 배포 번들에서만 발생, 2026-08-27 Runtime Logs로
  // 확인). serverExternalPackages로 지정하면 Node의 네이티브 모듈 해석을 쓰게
  // 돼서 이 문제가 사라진다. firebase-admin/firestore는 같은 패키지인데도
  // 이 문제가 없었지만(getDb()는 계속 잘 동작해왔음), auth 서브모듈만의
  // 내부 의존성 차이로 보인다 - 패키지 전체를 external로 묶어도 안전함.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
