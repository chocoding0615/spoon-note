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

### ✅ Firebase 실연동 검증 + 버그 2건 수정(2026-08-26)

전용 Firebase 프로젝트(`spoon-note`) 생성, 서비스 계정 키를 `.env.local`에
반영하고 curl로 실제 흐름(보드 생성→조회→상세페이지→엔트리 추가→목록→
비공개 접근제어→삭제)을 끝까지 검증. 그 과정에서 실제 버그 2건 발견·수정:

1. **Firestore가 `undefined` 필드를 거부함** - Board/Entry는 선택 필드가 많아
   값이 없으면 JS `undefined`로 남는데, `.set()`이 그걸 그대로 거부해서 보드
   생성 자체가 실패했음. `lib/firebaseAdmin.ts`에서 `getDb()`가 최초 1회
   `ignoreUndefinedProperties: true`를 설정하도록 수정(매 필드마다 undefined
   걸러내는 방어 코드를 서비스 계층 곳곳에 넣는 대신 한 곳에서 처리)
2. **`entryService.listEntries`가 복합 색인을 요구함** - `where(boardId) +
   orderBy(rank)`는 Firestore가 콘솔에서 수동으로 색인을 만들어야 동작하는
   쿼리라, 엔트리 목록 조회·보드 상세 페이지가 전부 500이었음. orderBy를
   빼고 fetch 후 JS에서 rank로 정렬하도록 변경(freeEntriesPerBoard=50이라
   메모리 정렬로 충분, 새 Firebase 프로젝트마다 색인 수동 생성 안 해도 됨)

**주의**: curl 명령줄에 한글을 직접 넣으면 이 PC 콘솔(CP949) 인코딩 때문에
서버로 깨진 바이트가 그대로 전송·저장됨(§8에서 경고한 것과 같은 종류의 문제,
셸 echo뿐 아니라 셸 인자로 넘기는 것도 위험). 한글이 포함된 요청은 UTF-8
파일로 작성해 `curl --data-binary @file`로 보내야 안전함 - 이번 테스트로
실제 재현·확인함. 앱 코드 자체의 인코딩 처리는 문제없음(파일로 보내면 한글
정상 저장·조회됨을 확인).

**검증 완료**: 보드 생성/조회/삭제, 엔트리 추가/목록, 보드 상세 페이지
(list/map 뷰 둘 다 200), private 보드 접근제어(ownerKey 없음/틀림 → 404,
맞음 → 200, API 직접 호출도 동일하게 막힘), OG 메타(제목/설명 정상 렌더).
테스트로 만든 보드 3개는 DELETE로 정리 완료. `npm run build`/`lint` 재확인.

**아직 못 한 것**: 브라우저로 직접 열어서 확인 안 함 - Leaflet 지도 실제
렌더링, 드래그 정렬 UX, 모달 애니메이션/포커스 트랩. 코드·API 레벨은
검증됐지만 화면 자체는 아직 안 봄.

## 실행 전 필요한 것

- `.env.local`은 이미 채워짐(spoon-note 전용 Firebase 프로젝트) - 로컬에만
  있고 git에는 안 올라감(`.gitignore`의 `.env*` 규칙)
- Kakao/Google API 키는 선택 — 없으면 주소·좌표 보강 없이 URL에서 뽑은 값만 사용

## 체인지로그

### 2026-08-26 — 외부 코드리뷰 수정 배치 1 (6건)

1. **RankableEntryList props 동기화 버그** - `useState(entries)`로 1회 복사하던
   구조를 걷어내고 데이터 소유권을 `BoardDetailClient` 하나로 모음(controlled
   컴포넌트). `RankableEntryList`는 `entries`/`dirty`를 props로만 받고
   `onReorder`/`onSaveOrder`로 부모에 위임 - 내부엔 `dragIndex`/`saving`
   같은 순수 UI 상태만 남김. 리스트 뷰에 머문 채 장소를 추가해도 즉시 반영됨
2. **`fetchHtml` SSRF 구멍(리다이렉트)** - 기본 `redirect:"follow"`라서
   `resolveFinalUrl`이 검증한 최종 URL이 다시 내부망으로 리다이렉트하면
   그대로 따라가버림. `redirect:"manual"`로 바꾸고 3xx 응답은 null 처리
3. **`isPrivateHostname` IP 리터럴 우회** - 사설 대역 dotted-quad만 걸러서
   `[::ffff:127.0.0.1]`, `2130706433`(십진수), `0x7f000001`(hex) 등이 전부
   통과했음. 지도 링크는 항상 도메인이므로 IP 리터럴 형태는 공개/사설 구분
   없이 전부 차단하도록 변경
4. **`reorderEntries` 수평 권한 우회** - 전달된 엔트리 ID가 해당 보드 소속인지
   확인 안 해서, A 보드 ownerKey로 B 보드 엔트리 순서를 조작 가능했음.
   보드 소속 ID 집합을 먼저 조회해 필터링, 소속 아닌 ID는 조용히 무시
5. **쓰기 API 레이트리밋 부재** - `POST /api/boards`, `POST .../entries`가
   무제한이라 Firestore 과금 폭탄 위험. `RATE_LIMITS`에 `createBoard`(시간당
   10회)/`addEntry`(시간당 60회) 추가, `/api/parse`와 동일 패턴(429 +
   Retry-After) 적용
6. **엔트리 입력값 의미 검증 누락** - `source`/`stars`/`lat`/`lng`이 타입만
   맞으면(예: `source:"hacker"`, `stars:99`) 그대로 저장됐음.
   `entryService.addEntry`에 의미 검증 추가(라우트의 shape 매핑은 그대로 둠)

전부 실제 Firebase 프로젝트에 curl로 재현 후 수정 확인(SSRF 4종 URL 차단,
레이트리밋 11번째 요청부터 429+Retry-After, 타 보드 엔트리 ID 필터링,
source/stars/lat 잘못된 값 400 응답). 테스트로 만든 보드는 전부 삭제 정리.

**참고**: 레이트리밋 TTL(만료된 `rateLimits` 문서 자동 정리)은 코드가 아니라
Firebase 콘솔 작업 - Firestore → 수명(TTL) 정책에서 `rateLimits` 컬렉션의
`expireAt` 필드를 지정해야 함. 아직 설정 안 함.

### 2026-08-27 — 프로덕션 Firebase 인증 장애 (사후 기록)

배포 후 처음으로 `spoon-note.vercel.app`에 직접 쓰기/읽기(`/api/boards` POST·GET)를
curl로 테스트해보고 나서야 발견 - **보드 생성/조회가 전부 500으로 완전히 죽어있었음**.
로컬(`localhost:3001`)은 문제없이 동작해서 코드 문제가 아니라 Vercel 쪽 환경변수
문제로 좁혀서 진단:

1. 처음엔 `FIREBASE_PRIVATE_KEY` 형식(따옴표 포함 복붙 등)을 의심해서 두 번
   재입력했지만 무관했음
2. `firebaseAdmin.ts`에 임시 진단 로그(각 env의 존재 여부/길이만, 값 자체는
   안 찍음) 추가해서 배포 → Vercel Runtime Logs로 실제 상태 확인
3. 1차 진단: `FIREBASE_PROJECT_ID`가 비어있었음(발견 즉시 수정) → 에러 메시지가
   바뀌면서 2차 문제 노출: **`FIREBASE_CLIENT_EMAIL`이 완전히 비어있었음**
   (firebase-admin의 `cert()`가 필드를 순서대로 검증해서, 첫 번째로 걸리는
   필드의 에러만 보여주는 바람에 project_id 고치기 전까진 client_email 문제가
   가려져 있었음)
4. `FIREBASE_CLIENT_EMAIL` 값 입력 + 재배포로 해결. 실제 서비스 계정 키
   3개(project_id/client_email/private_key) 중 둘이 동시에 비어있었던 것으로
   추정 - 최초 등록 시점에 셋 중 일부가 누락된 채 저장됐던 것으로 보임
5. 원인 확정 후 진단 로그는 제거함(이 커밋 이후)

**교훈**: 배포 후 페이지가 뜬다고 API 라우트(특히 쓰기)까지 정상인 건 보장 안 됨 -
`NEXT_PUBLIC_SITE_URL` 때도 그랬듯, Vercel의 여러 env 변수 중 하나라도 빈 값으로
등록되면 페이지는 열려도 Firestore를 건드리는 라우트는 조용히(또는 500으로) 죽을
수 있음. 새 env 변수 등록/수정 후에는 **프로덕션 도메인에 직접 curl로 쓰기
경로까지** 확인하는 걸 배포 체크리스트에 넣을 것.

### 2026-08-27 — 코드리뷰 수정 배치 2 (우선순위 상위 항목)

README "알려진 이슈" 14건 중 사용자 체감 버그·간단 수정 위주로 진행. 순서:
UI 실패 은폐 → 구글 파서 취약점 → SSRF/레이트리밋.

1. **엔트리 추가/순서 저장 실패가 성공처럼 보이던 버그 2건 수정** -
   `BoardDetailClient.handleAddEntry`/`handleSaveOrder`가 실패를 그냥 삼키던 걸
   `{ok, error}` 반환 또는 throw로 바꾸고, `AddEntryDialog`/`RankableEntryList`가
   실패 시 모달을 안 닫고/저장 버튼을 안 지우고 에러 메시지를 보여주도록 수정
2. **구글·폴더 파서 호스트명 부분일치 취약점 수정** - `hostname.includes("google.")`,
   `hostname.endsWith("naver.com")`(도메인 경계 미검증)를 `isHostnameOf()`
   헬퍼(`lib/parsers/http.ts`)로 교체. `google.ts`뿐 아니라 홈 세션이 추가한
   `placelist.ts`의 네이버/구글 폴더 판별에도 같은 문제가 있어서 같이 고침.
   구글은 `google.com`만 허용하기로 결정(다른 국가 TLD는 배제 - 안전 우선)
3. **SSRF DNS 리바인딩 방어 추가** - `fetchWithTimeout`(모든 외부 fetch의 단일
   진입점) 안에서 실제 fetch 직전에 `dns.lookup()`으로 호스트가 가리키는 IP까지
   재검증. **버그 발견·수정**: 처음엔 리터럴 호스트명용 `isPrivateHostname`(IPv6는
   전부 차단)을 그대로 재사용했다가, kakao.com/google.com의 정상 AAAA(IPv6)
   레코드까지 막혀서 파싱 자체가 전부 깨짐(로컬 재현 후 발견) - DNS가 실제로
   돌려준 주소 전용의 `isPrivateResolvedIp()`를 새로 만들어 IPv6는 실제
   사설/예약 대역(`::1`, `fe80::/10`, `fc00::/7`, IPv4-매핑)만 정확히 걸러내도록
   수정. 여전히 완벽한 방어는 아님(조회~fetch 사이 짧은 시간차는 남음 - 코드
   주석에 명시)
4. **레이트리밋 IP 스푸핑 - 코드 변경 없이 종결** - 실제 프로덕션에
   `X-Forwarded-For`를 스푸핑해서 직접 공격 재현: Firebase 장애로 레이트리밋이
   fail-open이던 동안엔 당연히 안 걸렸지만, Firebase 복구 후 다시 테스트하니
   **완전히 새로운 스푸핑 값을 써도 즉시 차단됨** - Vercel 엣지가 클라이언트가
   보낸 헤더를 무시하고 실제 접속 IP로 덮어쓰는 것으로 확인. 코드 자체의 이론적
   약점(신뢰 가능한 프록시 설정 없음)은 남아있지만 이 배포 환경에서 실익이 없어
   보류 - 다른 플랫폼으로 옮기면 재검토 필요

전부 `npm run build`/`lint` 통과, 로컬 dev 서버로 SSRF 차단·정상 파싱(카카오/
구글)·가짜 도메인 차단까지 재현 확인.

### 2026-08-27 — 커뮤니티 랭킹 데이터 레이어 (엔티티 매칭 + 트랜잭션 세이프 카운트)

"여러 사람이 각자의 보드에 저장한 장소 중 같은 곳이 몇 번 찜됐는지" 집계하는
데이터 레이어 신규 구현(UI는 다음 단계). 처음으로 테스트 러너(vitest) 도입.

**설계**
- `lib/services/matching.ts` — 순수 함수만 모음(부작용 없음, Firestore 접근
  없음): `extractPlaceId`(네이버/카카오 sourceUrl에서 원본 place ID 추출 -
  구글/manual은 안정적 ID가 없어 항상 null), `haversineDistanceMeters`,
  `nameSimilarity`(Levenshtein 기반), `decideMatch`(같은 소스+ID면 정확 매칭,
  아니면 좌표 50m 이내 + 이름 유사도 0.6 이상일 때만 근사 매칭 - 애매하면
  별개로 둠). 순수 함수라 Firestore 없이 유닛테스트 가능
- `lib/services/canonicalPlaceService.ts` — Firestore I/O.
  `canonicalPlaces/{id}` 컬렉션 + `canonicalPlaces/{id}/boards/{boardId}`
  서브컬렉션(문서 ID를 boardId로 고정해서 "이 보드가 이미 카운트에
  반영됐는지"를 쿼리 없이 결정적으로 확인). 원본 ID가 있는 소스(네이버/카카오)는
  `canonicalId`를 `"source:placeId"`로 고정해서, 같은 장소를 동시에 처음
  등록해도 두 요청이 같은 문서로 수렴함(레이스 없음) - 원본 ID가 없는
  구글/manual만 좁은 레이스가 남는 걸 알고 감수
- `lib/constants.ts`의 `COMMUNITY` — `goldThreshold`(기본 2), `matchRadiusMeters`
  (50), `matchNameSimilarity`(0.6) 하드코딩 금지, config로 분리
- `entryService.addEntry`/`boardService.deleteBoard`에 연결 - 둘 다 실패해도
  핵심 동작(엔트리 추가/보드 삭제)은 성공해야 해서 fail-open(로그만 남김).
  `Entry.canonicalId`를 추가 시점에 고정 저장해서, 삭제 시 그 값으로 정확히
  되돌림(그때 다시 매칭하면 데이터가 바뀌어 다른 결과가 나올 수 있어 금지)

**실제 발견한 버그 2건**
1. **Firestore 트랜잭션 안에서 `Promise.all([tx.get(a), tx.get(b)])`가 조용히
   씹힘** - 에러 없이 트랜잭션이 "성공"하지만 실제로는 아무것도 안 써짐(로컬
   재현으로 발견). 두 `tx.get()`을 순차 `await`로 바꿔서 해결
2. **테스트 데이터 오염이 근사 매칭을 오작동시킴** - 여러 테스트가 같은 좌표
   (37.5, 127.0)를 공유해서 썼는데, 실패한 테스트가 정리 전에 만든 orphan
   canonical place가 다음 테스트 실행에서 "가까운 후보"로 잡혀 엉뚱하게
   매칭됨. 테스트마다 서로 수십km씩 떨어진 좌표를 쓰도록 고쳐서 근본 해결.
   기존에 쌓인 orphan 문서(테스트 실패로 13개 남아있었음)도 정리함

**검증**: 유닛테스트 20개(matching.ts) + 통합테스트 5개(canonicalPlaceService.ts,
실제 dev Firebase 프로젝트에 direct로 붙어서 검증 - 10개 보드 동시 추가해도
saveCount 정확히 10, 같은 보드 중복 추가는 1 유지, 다른 서비스 근사 매칭,
50m 밖은 매칭 안 함, 보드 삭제 시 정확히 감소) 전부 통과. 실제 dev 서버로
카카오 엔트리 추가 → `canonicalId:"kakao:8098381"` 응답 확인 → 보드 삭제 →
saveCount 0으로 감소까지 실제 API로 재현 확인. 테스트로 만든 데이터는 전부 정리.

**다음 단계(미착수)**: UI에서 saveCount/goldThreshold 노출(예: EntryCard에
"인기 장소" 배지), canonical place 조회 API 라우트.

### 2026-08-27 — 공개설정 3단계 재구성(비공개/링크공유/커뮤니티공개) + 닉네임

**중요 - 지시서와 실제 코드 상태가 달랐음**: 지시서는 "지금은 공개/비공개
2단계"라고 했지만, 실제 `Visibility` 타입은 이미 `public/unlisted/private`
3단계였음(다만 `public`과 `unlisted`가 기능적으로 완전히 동일 - 커뮤니티 노출
기능 자체가 없어서 "전체공개"라는 라벨만 다르고 접근 제어는 같았음). 그래서
"2→3단계 마이그레이션"이 아니라, **예전 `public`을 폐기하고 `community`를
새로 만든 다음, 기존 `public` 문서를 `unlisted`로 옮기는** 작업으로 진행함
(지시서 요구사항 1의 "기존 '공개'였던 보드는 '링크공유'로" 매핑과 결과적으로
동일 - 커뮤니티에 자동 노출되면 안 된다는 요구사항도 그대로 충족).

- `lib/types.ts` — `Visibility = "private" | "unlisted" | "community"`,
  `Board.nickname?: string` 추가
- `lib/constants.ts` — `VISIBILITY_OPTIONS` 3단계 재정의(비공개/링크공유/
  커뮤니티공개), `VISIBILITY_VALUES`(옵션에서 값만 뽑은 배열 - 코드리뷰에서
  지적됐던 "라우트마다 하드코딩된 검증 배열" 문제를 이 참에 같이 해결),
  `DEFAULT_NICKNAME`("익명의 미식가"), `LIMITS.nicknameMaxLength`(20)
- `lib/services/boardService.ts` — `createBoard`/`updateBoard`가 `nickname`
  받아서 트림/길이제한 후 저장. **`migratePublicVisibility()`** 추가 -
  `visibility=="public"`인 문서를 찾아 `unlisted`로 일괄 변경(멱등적, 여러 번
  실행해도 안전). 실행해보니 실제 운영 데이터엔 그런 문서가 0개였음(아직
  출시 전이라 당연함) - 그래도 나중에 실사용자 데이터가 생기기 전에 코드를
  마련해두는 게 맞다고 판단해서 구현
- `lib/utils/nickname.ts` — 닉네임 localStorage 저장/조회. 계정 개념이 없는
  앱이라 "재사용"의 실체는 이 값뿐 - 서버(`Board.nickname`)엔 그 보드를 만든
  시점의 스냅샷만 남고, 다음 보드 만들 때 입력창을 미리 채우는 용도로만 씀
- `components/board/VisibilitySelector.tsx` — "커뮤니티공개" 선택 시에만
  닉네임 입력창을 인라인으로 보여줌(선택 입력, 비워두면 기본 표시명)
- `app/boards/new/page.tsx` — 닉네임 state를 `getNickname()`으로 미리 채우고,
  제출 성공 시 `saveNickname()`으로 갱신. 보드 수정(PATCH) UI는 아직 없어서
  (API는 지원하지만 붙어있는 화면이 없음) 닉네임/공개설정 변경은 지금은
  보드 생성 시점에만 가능 - 별도 "보드 설정" 화면은 요청 범위 밖이라 안 만듦

**검증**: 통합테스트 2개 추가(`boardService.test.ts` - public→unlisted 마이그
레이션 정확성 + 멱등성, 실제 dev Firebase에 direct로 확인). 전체 테스트
27개 통과. 실제 dev 서버로 커뮤니티공개+닉네임 보드 생성(응답에 nickname
포함 확인) → 상세 페이지에 "커뮤니티공개" 라벨 렌더 확인 → 예전 `"public"`
값 보내면 자동으로 `unlisted`로 폴백되는 것 확인(하위 호환) → private 보드
접근 제어 회귀 없음 확인 → PATCH로 visibility/nickname 수정도 확인. 테스트
데이터는 전부 정리.
