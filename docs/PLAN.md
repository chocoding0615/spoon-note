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

### ✅ 3단계 — 보드 CRUD

- `lib/services/errors.ts` (`ValidationError`/`OwnershipError`/`NotFoundError`,
  doc엔 없던 파일이지만 서비스 계층 에러를 라우트에서 타입으로 구분하기 위해 추가)
- `lib/services/boardService.ts` — 생성(slug 충돌 재시도)/조회/수정/삭제.
  `getViewableBoard(slug, ownerKey?)`가 visibility 정책의 단일 진입점 -
  private 보드는 ownerKey 불일치 시 null(→404)을 돌려줘서 **페이지뿐 아니라
  API로 직접 slug를 알아도 못 보게** 막음(문서엔 페이지 레벨 정책으로만
  적혀있었지만 API 레벨에서도 동일하게 적용해야 실제로 안전함)
- `app/api/boards/route.ts`(POST 생성/GET `ownerKeys=` 콤마 목록으로 내 보드
  일괄 조회), `app/api/boards/[slug]/route.ts`(GET/PATCH/DELETE, 변경은
  `x-owner-key` 헤더 필요)
- `app/boards/new/page.tsx`, `app/my/page.tsx` — ownerKey는 계정이 아니라
  보드별 개별 발급이라 "내 보드"는 로컬에 저장된 slug/ownerKey 쌍을 전부 모아
  `ownerKeys=` 배치 조회로 구성
- `lib/utils/ownerKey.ts` — localStorage 저장/조회 + `useOwnedBoards()`
  (`useSyncExternalStore` 기반). 처음엔 `useEffect`+`setState`로 짰다가
  `react-hooks/set-state-in-effect`(Next 16 신규 린트 룰)에 걸려서 교체함
- `LIMITS.freeBoards` 체크는 서버가 아니라 클라이언트(로컬 개수)에서만 -
  ownerKey가 계정과 무관하므로 서버 단에서 "이 사람이 이미 몇 개 만들었는지"를
  원천적으로 알 방법이 없음(v0 한계, 우회 가능함을 인지하고 감수)

### ✅ 4단계 — 엔트리와 보드 상세

- `lib/services/entryService.ts` — 추가(freeEntriesPerBoard 제한, rank=max+1)/
  목록/순서 일괄 저장(PATCH, ownerKey 필요 - §5-4 "드래그 정렬(ownerKey 보유
  시)"에 따름). 엔트리 추가는 ownerKey 없이도 가능(친구와 공유해서 같이
  채우는 컨셉이라 방문자 열람 가능한 보드엔 누구나 담을 수 있게 함)
- `app/api/boards/[slug]/entries/route.ts` — POST/GET/PATCH
- `components/board/MapView.tsx` + `MapViewLoader.tsx` — leaflet은
  `next/dynamic`+`ssr:false`로 로드(§1 제약). `ssr:false`는 Client Component
  안에서만 허용되는 Next 16 제약이라, 서버 페이지가 아니라
  `MapViewLoader`("use client")가 그 경계를 담당하도록 분리함. 마커는
  기본 아이콘 대신 `L.divIcon` SVG로 대체(깨짐 방지, §1)
- `components/entry/EntryCard.tsx`, `AddEntryDialog.tsx`, `RankableEntryList.tsx`
  — **`EntryList`는 별도로 안 만들었음**: `RankableEntryList`가 `editable`
  플래그로 드래그 가능/불가능 렌더링을 다 처리해서, 거의 동일한 컴포넌트를
  하나 더 두는 게 오히려 중복이라 판단(문서 §3 트리와의 의도적 차이)
- 드래그 정렬은 별도 패키지 없이 네이티브 HTML5 drag&drop 이벤트로 구현
  (§5-3 "드래그 라이브러리 자유, 번들 가벼운 것 우선"에 따라 0바이트 선택)
- `components/ui/`에 Textarea/Select/Modal/StarRating 추가(§2-3 원칙에 따라
  도메인 무관 프리미티브는 ui/로 - §3 트리 주석은 StarRating을 entry/ 밑에
  적어놨지만 §2-3 규칙이 더 명시적이라 그쪽을 따름)

### ✅ 5단계 — 공유와 OG

- `app/b/[slug]/page.tsx`의 `generateMetadata` — 보드 제목/설명/entryCount 반영
- `components/board/BoardHeader.tsx` — Web Share API 지원 시 그걸로, 아니면
  클립보드 복사+토스트. 공유 URL에서 `ownerKey` 쿼리는 제거하고 보냄(안 그러면
  공유받은 사람이 실수로 소유자 링크를 얻게 됨)
- 랜딩(`app/page.tsx`)에 "보드 만들기"/"내 보드 보기" 진입 링크 추가

**검증(2026-08-26)**: `npm run build`/`lint` 통과, dev 서버로 모든 페이지·API
라우트 curl 확인. Firestore가 `.env.local` 없이는 당연히 실패하는데, 그 경우
전부 500 + 한글 에러 메시지로 깔끔하게 떨어지는 것까지 확인함(크래시 아님).
**단, 보드 생성→조회→엔트리 추가→지도 렌더링의 실제 성공 경로는 Firebase
자격증명이 있어야만 끝까지 검증 가능** - 아직 못 함.

## 실행 전 필요한 것

- `.env.local` 생성 (`.env.example` 참고) — Firebase 서비스 계정 키 3종 없으면
  보드 생성/조회/엔트리 추가가 전부 500으로 막힘(에러 자체는 깔끔하게 처리됨).
  **이게 있어야 3~5단계 전체 흐름을 실제로 검증할 수 있음**
- Kakao/Google API 키는 선택 — 없으면 주소·좌표 보강 없이 URL에서 뽑은 값만 사용
- 브라우저로 직접 열어서 확인 안 한 것: Leaflet 지도 실제 렌더링, 드래그
  정렬 UX, 모달 애니메이션/포커스 트랩 - 코드상 문제는 없어 보이지만 실사용
  확인은 아직임
