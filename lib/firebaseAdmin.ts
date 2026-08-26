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
  if (!firestore) firestore = getFirestore(getApp());
  return firestore;
}
