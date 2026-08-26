import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// 초기화를 첫 사용 시점으로 미룬다(모듈 로드 시점이 아니라) - `next build`의
// 페이지 데이터 수집 단계가 라우트 모듈을 전부 import만 해봐도 되는데, 그때 env
// 값이 아직 없으면(.env.local 세팅 전 등) 여기서 죽으면 곤란하기 때문.
let app: App | undefined;

function getApp(): App {
  if (app) return app;
  app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });
  return app;
}

let firestore: Firestore | undefined;

export function getDb(): Firestore {
  if (!firestore) {
    firestore = getFirestore(getApp());
    try {
      // Board/Entry는 선택 필드가 많아 값이 없으면 JS undefined로 남는데,
      // Firestore는 기본적으로 undefined 필드를 거부한다. 매번 필드별로
      // undefined를 걸러내는 대신 여기서 한 번에 허용하도록 설정.
      firestore.settings({ ignoreUndefinedProperties: true });
    } catch {
      // dev 서버 핫리로드로 이 모듈이 재평가돼도 firebase-admin 내부의
      // Firestore 싱글턴은 앱 인스턴스 기준으로 그대로 남아있어 settings()가
      // "이미 초기화됨"으로 던질 수 있다 - 최초 1회는 이미 적용됐다는 뜻이라 무시.
    }
  }
  return firestore;
}
