# 스푼노트 (SpoonNote)

네이버·카카오·구글 지도 링크를 붙여넣으면 하나의 보드(지도+리스트)에 모아,
링크 하나로 친구와 공유하는 맛집 리스트 웹앱.

- 핵심 루프: `링크 붙여넣기 → 장소 자동 파싱(반자동 확인) → 보드 저장 → 보드 링크 공유`
- 스택: Next.js 16(App Router, TS strict) · Tailwind 4 · Leaflet/OSM · Firebase Firestore
- 아키텍처 원칙·작업 이력·의도적 설계 결정은 [`docs/PLAN.md`](docs/PLAN.md) 참고

## 시작하기

```bash
npm install
cp .env.example .env.local   # 값 채우기(아래 참고)
npm run dev                  # http://localhost:3001 (3000은 다른 프로젝트와 충돌 방지용으로 비움)
```

### 환경변수 (`.env.local`)

- `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` — 필수.
  Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성으로 받은 JSON에서 추출.
  없으면 보드 생성/조회/엔트리 추가가 전부 실패함(파싱 자체는 키 없어도 URL 패턴 추출까지는 동작)
- `KAKAO_REST_API_KEY` / `GOOGLE_PLACES_API_KEY` — 선택. 없으면 주소·좌표 보강 없이
  URL에서 뽑은 값만 사용
- `NEXT_PUBLIC_SITE_URL` — `generateMetadata`의 `metadataBase` 등에 사용

## 알려진 이슈 (코드리뷰 결과)

외부 코드리뷰 8개 관점으로 전체 브랜치를 검토해 14건을 발견(2026-08-26).
우선순위 높은 것부터 수정 진행 중 - 아래는 남은 항목, 수정된 건 체인지로그
([`docs/PLAN.md`](docs/PLAN.md)) 참고.

### ✅ 수정 완료(2026-08-27)

- SSRF(호스트명 문자열만 검사 → DNS로 실제 IP까지 재검증), 구글/폴더 파서
  호스트명 부분일치 취약점, 엔트리 추가·순서 저장 실패가 성공처럼 보이던 버그 2건
- **레이트리밋 IP 스푸핑**: 실제 배포(Vercel)에 스푸핑 헤더로 직접 테스트해본 결과
  Vercel 엣지가 클라이언트가 보낸 `x-forwarded-for`를 덮어써서 이 배포 환경에서는
  스푸핑이 안 먹히는 걸 확인 - 코드 자체의 이론적 약점은 남아있지만(다른 플랫폼에
  배포하면 재검토 필요) 지금 당장 고칠 필요는 없다고 판단, 코드 변경 없이 종결

### 정확성 (남음)

- **`AddEntryInput` 타입이 두 곳에 따로 선언되어 필드가 어긋남**
  (`components/entry/AddEntryDialog.tsx:14`) — `entryService.ts`의 버전엔 있는
  `country`/`city`/`authorName`이 다이얼로그 쪽엔 없어서, 이 필드들은 UI로는
  영원히 입력할 방법이 없음
- **`POST /entries`가 `NotFoundError`를 못 잡아 500이 됨**
  (`app/api/boards/[slug]/entries/route.ts:82`) — 보드 조회 후 삭제되는 경합
  상황에서 404 대신 500 반환(PATCH 라우트는 이미 올바르게 처리 중)
- **`addEntry`의 개수 제한/순위 계산이 트랜잭션이 아님** (`lib/services/entryService.ts:63`) —
  동시에 두 명이 같은 보드에 장소를 추가하면 같은 rank를 가진 중복 엔트리가
  생기거나 50개 제한을 넘길 수 있음
- **`reorderEntries`가 불완전한 요청에 중복 rank를 만들 수 있음**
  (`lib/services/entryService.ts:106`) — 지금 UI는 항상 전체 목록을 보내서
  실제로는 안 터지지만, 서비스 함수 자체엔 방어 로직이 없음
- **`metadataBase` 기본값이 아직 3000번 포트** (`app/layout.tsx:15`) — dev 서버는
  3001로 옮겼는데 fallback만 안 바뀜

### 재사용성 / 단순화 (남음)

- `VISIBILITY_VALUES` 배열이 두 라우트에 하드코딩되어 `lib/constants.ts`의
  `VISIBILITY_OPTIONS`와 따로 놀 위험(`app/api/boards/route.ts:6`)
- `parseService.ts:112`의 `placeName` 폴백 체인에 절대 도달 안 하는 죽은 분기 있음

### 효율성 (남음)

- 보드 상세 페이지가 `generateMetadata`와 페이지 컴포넌트에서 각각 보드+엔트리를
  따로 조회해 요청당 Firestore 읽기가 2배(`app/b/[slug]/page.tsx:16`)
- `listEntries`/`addEntry`/`reorderEntries`가 개수·ID만 필요한데도 매번 엔트리
  전체 문서를 읽어옴(`lib/services/entryService.ts:19`)

## 배포

Vercel 배포 시 위 환경변수를 프로젝트 설정에 동일하게 등록해야 함. `FIREBASE_PRIVATE_KEY`는
개행이 포함된 값이라 Vercel 대시보드에 그대로 붙여넣으면 됨(코드에서 `\n` 이스케이프를
실제 개행으로 변환하는 처리가 이미 되어 있음 - `lib/firebaseAdmin.ts`).
