# 스푼노트 MVP — 작업 계획 요약

원본 지시서: `C:\Users\admin\Desktop\김현호\스푼노트.md`

## 프로젝트

네이버·카카오·구글 지도 링크를 붙여넣으면 하나의 보드(지도+리스트)에 모아, 링크
하나로 공유하는 맛집 리스트 웹앱. 핵심 루프: `링크 붙여넣기 → 장소 자동 파싱
(반자동 확인) → 보드 저장 → 보드 링크 공유`

## 스택

Next.js 16(App Router, TS strict) · Tailwind 4 · Leaflet/OSM(카카오맵 SDK 금지,
`next/dynamic` + `ssr:false`) · Firebase Firestore(firebase-admin, API 라우트
전용) · 인증 없음(v0, `ownerKey` 발급 방식)

## 아키텍처 원칙

1. 매직값은 `lib/constants.ts`로
2. 파서는 전략 패턴 + 레지스트리(`lib/parsers/`), if/else 체인 금지
3. `components/ui/`(도메인 무관 프리미티브) vs `components/<feature>/`(피처) 분리
4. 반복 렌더링은 map
5. 색상은 Tailwind 테마 변수(CSS 변수)
6. API 라우트는 얇게, 로직은 `lib/services/`
7. 타입은 `lib/types.ts`에서만, any 금지

## 진행 상태

### ✅ 1단계 — 스캐폴딩 정리

- `lib/types.ts`, `lib/constants.ts`, `lib/firebaseAdmin.ts`(chemi-map 패턴
  참조), `lib/rateLimit.ts`(Firestore 고정창 카운터, **Firestore 미설정 시
  fail-open**), `lib/utils/slug.ts`
- `app/layout.tsx` 한글 메타데이터/OG, `app/page.tsx` 랜딩(히어로+PasteBox)
- `components/ui/`: Button, Input, Spinner, Card, Badge
- create-next-app 기본 템플릿·SVG 제거

### ✅ 2단계 — 파싱 파이프라인

- `lib/parsers/{types,naver,kakao,google,manual,index}.ts` — 레지스트리 방식
  (`manual`은 URL 파서가 아니라 수동 입력 헬퍼라 registry 배열엔 미포함)
- `lib/parsers/http.ts` — 내부망/localhost 차단, http/https만 허용, 리다이렉트
  홉마다 안전 검증, 5초 타임아웃
- `lib/services/parseService.ts` — URL 패턴 추출 후 부족한 필드만 API로 보강
  (Kakao Local API / Google Places API Text Search, 키 없으면 생략)
- `app/api/parse/route.ts` — IP 레이트리밋(시간당 30회) 적용
- `components/paste/PasteBox.tsx` — 성공/수동폴백/에러 상태 처리

**실사용 링크로 검증 완료(2026-08-26)**:
- 카카오맵(`place.map.kakao.com/{id}`): og:title/og:description 정상 추출 확인
- 구글맵(`/maps/place/{name}/@{lat},{lng}`): 이름·좌표 정상 추출 확인
- **네이버지도: 서버 스크래핑 불가 확인** — `map.naver.com`은 og:title 없는 SPA
  껍데기, `m.place.naver.com`은 서버 요청(curl UA)에 캡차(ncaptcha) 스텁을
  돌려줌. 브라우저 방문에는 문제없지만 서버 사이드 fetch로는 막힘.
  **결정(사용자 확인, 2026-08-26): 우회 시도 없이 수동 입력 폴백으로 둔다.**
  `naverParser`는 코드는 그대로 두되(가끔 될 수도 있어 best-effort로 시도) 대부분
  null → 클라이언트가 자동으로 수동 입력 모드로 넘어감(이미 의도된 폴백 경로라
  추가 구현 불필요). MVP 출시 후 실사용 데이터를 보고 우회 방법(공식 API,
  헤드리스 브라우저 등)을 재검토하기로 함.

### ⏳ 다음 단계 (미착수)

3. 보드 CRUD — `lib/services/boardService.ts`, `app/api/boards/*`, 생성/목록 화면
4. 엔트리와 보드 상세 — AddEntryDialog, EntryList, MapView(Leaflet), 랭킹 드래그
5. 공유와 OG — generateMetadata, 공유 버튼, 랜딩 폴리시

## 실행 전 필요한 것

- `.env.local` 생성 (`.env.example` 참고) — Firebase 서비스 계정 키 3종 없으면
  보드 저장·레이트리밋이 동작 안 함(파싱 자체는 키 없어도 URL 패턴 추출까지는 됨)
- Kakao/Google API 키는 선택 — 없으면 주소·좌표 보강 없이 URL에서 뽑은 값만 사용
