# 작업 노트

세션이 바뀌어도 이어서 작업할 수 있게, 그날그날 한 작업을 여기 요약해둔다.
`CLAUDE.md`가 이 파일을 자동으로 불러오니 새 세션을 열면 자동으로 컨텍스트에
들어간다. 오래된 항목은 필요 없어지면 지워도 된다.

## 프롬프트 9 — 계정 시스템 (1~4단계: 소셜 로그인 + ownerKey 연결)

설계안(승인됨) 순서대로 진행 - chemi-map(`C:\Users\admin\chemi-map`)의 로그인
코드를 실제로 읽고 이식하는 것으로 시작. 이번 커밋 범위는 카카오·네이버
로그인 + ownerKey↔계정 연결 + 커뮤니티공개 게이팅까지(이메일 회원가입은 다음
커밋).

**세션(`lib/session.ts`)** - chemi-map 구조 그대로: JWT 아니고 Firestore
문서 기반 토큰(`sessions/{token}`, 30일, 로그아웃 시 문서 삭제로 즉시 무효화).
`users/{provider}_{providerId}`로 결정적 uid. 쿠키 이름만
`spoonnote_session`/`spoonnote_oauth_state`로 바꿈. `nanoid` 대신 이미
쓰고 있던 `node:crypto`만으로 토큰 생성(새 의존성 안 늘림).

**카카오·네이버 OAuth(`lib/oauth/`)** - chemi-map과 거의 동일하지만 한 가지
의도적으로 다르게 함: chemi-map은 `age_range`(범위, "20~29")를 요청하는데
스푼노트는 `birthyear`(정확한 연도)를 요청함 - 프롬프트 9 요구사항 4(만 14세
미만 제한)를 범위값으로는 정확히 판정할 수 없어서(§설계안 artifact 06).
**각 콘솔에서 별도 동의항목 활성화가 필요함**(카카오: "카카오 로그인" 상품 +
"생년" 동의항목 + Redirect URI 등록, 네이버: 로그인용 앱 신규 등록 + "출생연도"
제공항목 - 아직 안 돼있어서 실제 로그인은 카카오도 콘솔 설정 전까진 안 될 것으로
예상, 네이버는 `NAVER_CLIENT_ID` 자체가 없어서 `/api/auth/naver/login`이
501을 반환하는 것까지 확인함).

**ownerKey ↔ 계정 연결** - `Board.userId?: string` 필드만 추가(비파괴적,
마이그레이션 스크립트 불필요). `boardService.claimBoardsForAccount(uid,
ownerKeys)` - 이미 다른 계정에 연결된 보드는 안 건드림(스킵). `POST
/api/account/claim-boards`가 로그인 후 localStorage에 남은 ownerKey들을
일괄 연결.

**커뮤니티공개 게이팅** - `createBoard`/`updateBoard` 둘 다 visibility가
"community"로 향할 때 `assertCanGoCommunity(session)` 체크(하나만 막으면
다른 경로로 우회 가능해서 둘 다 막음 - 실제로 처음엔 updateBoard만 막았다가
createBoard로 바로 community 생성하면 뚫린다는 걸 알아채고 추가함).
로그인 안 함 → `AuthRequiredError`(401), 출생연도 없음(연령 미상, §설계안
06 A안 - 안전 우선으로 미성년자와 동일 취급) 또는 만 14세 미만 →
`AgeRestrictedError`(403). 전환 성공 시 그 자리에서 `userId` 자동 스탬프.

**마이페이지(`/my`)** - 서버 컴포넌트로 전환(`getSession()`을 쓰려면
`cookies()`가 필요해서). chemi-map `/my`의 로그인 전/후 분기 패턴을
스푼노트 톤으로 계승(`AccountPanel`). "내 보드" 목록은 계정 연결 보드(서버,
`userId` 기준)와 로컬 ownerKey 보드(클라이언트, 기존 로직)를 slug 기준으로
합쳐서 하나로 보여줌(`MyBoardsList`) - 이미 계정에 연결된 보드도 로컬에
ownerKey가 남아있어서 중복 제거가 필요했음.

**검증**: 실제 OAuth 콘솔 설정이 아직 안 돼있어서(카카오 로그인 상품
미활성화, 네이버 앱 미등록) 브라우저로 끝까지 로그인해볼 순 없었음 - 대신
Firestore에 가짜 세션(성인/미성년 각 1명)을 직접 심어서 세션 쿠키로
`/api/boards`(커뮤니티 생성 성공/미성년 차단), `/api/boards/[slug]`
(PATCH 전환), `/api/account/claim-boards`, `/my`(로그인 전/후 렌더링),
로그아웃(세션 무효화)까지 전부 실제로 호출해서 확인. 비로그인 상태로
커뮤니티 전환/생성이 막히는 것과, 로그인 필요 없는 일반 전환(비공개↔
링크공유)이 여전히 되는 회귀 확인도 함께 함. 테스트 데이터/가짜 세션 전부
정리. `npm run build`, `npm run lint`, `npx vitest run`(39개) 통과.

## 프롬프트 9 — 계정 시스템 (5단계: 이메일 회원가입)

**설계안에서 일부러 벗어난 부분**: 원래 설계안(§artifact 02)은 "클라이언트
Firebase SDK로 로그인 → ID 토큰을 서버에 보내 세션 발급"이었는데, 실제로 만들면서
보니 스푼노트는 지금까지 카카오/네이버 로그인 포함 전부 서버 라우트+리다이렉트만
쓰고 클라이언트 인증 SDK가 어디에도 없다는 걸 다시 확인했음 - 여기서만 `firebase`
클라이언트 패키지를 새로 들이면 번들 무게도 늘고 아키텍처도 깨져서, 클라이언트
SDK 없이 서버만으로 끝내는 쪽으로 바꿈:
- **회원가입**: `firebase-admin`의 `createUser()` - 이미 있는 Admin SDK만으로
  충분해서 새 키가 전혀 필요 없음
- **로그인**: Admin SDK엔 "비밀번호 검증" API가 없어서(관리용 SDK라 당연함),
  Firebase Identity Toolkit REST(`accounts:signInWithPassword`)를 서버에서
  직접 호출. `FIREBASE_WEB_API_KEY`(비밀값 아님 - 콘솔 프로젝트 설정에 그냥
  노출돼 있는 값, 그래도 서버 전용 env로만 둠) 하나만 새로 필요
- uid는 결정 필요 항목이었던 `email_{firebaseUid}` 형태로(§`makeUid("email", ...)`,
  기존 kakao_/naver_ 패턴과 통일)
- 출생연도(§프롬프트 9 요구사항 4): OAuth와 달리 이메일 가입은 제공자가 주는
  값이 아예 없어서, 가입 폼(`/login/email`)에 필수 입력으로 넣음
- `POST /api/auth/email/signup`, `POST /api/auth/email/login` - 이메일 로그인은
  비밀번호 무차별 대입 방지용 레이트리밋(시간당 20회) 추가

**실제로 재현해서 발견한 것**: 로컬에서 회원가입을 실제로 호출해보니
`auth/configuration-not-found` 에러가 남 - 이 Firebase 프로젝트에
**Authentication 자체가 아직 한 번도 활성화된 적이 없어서**(콘솔에서
"시작하기"를 누른 적이 없음) 나는 에러였음. Admin SDK의 `createUser` 호출
자체는 콘솔에서 이메일/비밀번호 제공업체를 켜지 않아도 되지만, Authentication
기능 자체는 콘솔에서 최초 활성화가 필요하다는 걸 이번에 알게 됨 - 서버 로그에
원인이 명확히 남도록 이 에러 코드만 따로 잡아서 안내 로그를 추가함. 이메일
형식/비밀번호 길이/닉네임 누락 등 자체 검증 로직은 Firebase 호출 전에 걸려서
정상 작동 확인(400으로 잘 응답함).

`npm run build`, `npm run lint`, `npx vitest run`(39개) 통과.

## 다음에 이어서 할 만한 것 - 프롬프트 9 잔여 (콘솔 설정 필요)
- **Firebase**: 콘솔 > Authentication > 시작하기로 최초 활성화 + "이메일/비밀번호"
  제공업체 켜기, 프로젝트 설정 > 일반에서 "웹 API 키" 복사해 `FIREBASE_WEB_API_KEY`로 설정
- **카카오**: 기존 앱에 "카카오 로그인" 상품 추가 활성화 + "생년" 동의항목 켜기 +
  Redirect URI(`{도메인}/api/auth/kakao/callback`) 등록 + Client Secret 발급해
  `KAKAO_CLIENT_SECRET`로 설정
- **네이버**: "네이버 아이디로 로그인" 앱 신규 등록 + "출생연도" 제공정보 켜기 +
  Callback URL(`{도메인}/api/auth/naver/callback`) 등록해 `NAVER_CLIENT_ID`/
  `NAVER_CLIENT_SECRET` 설정
- 위 콘솔 설정 전부 끝나면(로컬 `.env.local` + Vercel 둘 다) 브라우저로 세 가지
  로그인 경로를 실제로 끝까지 재검증해야 함(지금까진 가짜 세션 + API 직접 호출로만
  검증했음)

## 2026-08-27

**로컬 개발 환경 구성**
- 레포 클론(`chocoding0615/spoon-note`) + `npm install`
- Vercel 프로젝트 연동(`vercel link` → `chocoding0615s-projects/spoon-note`)
- Firebase 서비스 계정 키(`.env.local`)를 사무실에서 쓰던 파일에서 가져와 로컬에
  설정 - Vercel에 등록된 값은 Sensitive라 `vercel env pull`로는 평문을 못 가져옴,
  로컬은 직접 입력해야 함
- `npm run dev`(3001 포트)로 로컬 기동 확인, `/api/boards` 호출해서 Firestore
  연결까지 확인됨

**프로덕션 배포 버그 수정 - "도메인이 연결 안 된 것 같다"의 실제 원인**
- 첫 배포 이후 계속 빌드 실패 상태였음 - `NEXT_PUBLIC_SITE_URL`이 Vercel
  Production/Preview 둘 다 빈 문자열로 등록되어 있어서 `app/layout.tsx`의
  `new URL(siteUrl)`(metadataBase)에서 `Invalid URL`로 빌드가 죽고 있었음
- Production/Preview 둘 다 값 채워서(`https://spoon-note-chocoding0615s-projects.vercel.app`)
  재배포 → 빌드 성공
- 빌드가 처음 성공하면서 깔끔한 기본 도메인 `spoon-note.vercel.app`이 자동으로
  붙음(그 전엔 팀 접미사 붙은 URL만 있었음) - 즉 도메인 설정 문제가 아니라 빌드
  실패가 원인이었음

**"폴더(저장 목록) 링크 하나로 여러 장소 한번에 가져오기" - 조사**

개별 장소 링크(예: `m.place.naver.com/...`)는 네이버가 서버 요청에 캡차를
돌려줘서 이미 막혀있는 상태였음(자동 파싱 실패 시 수동 입력으로 폴백하는
기존 동작 그대로 둠). 이번엔 "저장 목록/폴더" 공유 링크(네이버 즐겨찾기
폴더 공유, 구글 지도 목록 공유, 카카오맵 폴더 공유)를 새로 조사함 - 셋 다
서버 fetch만으로 파싱 가능한 것으로 결론남:

- **네이버** (`naver.me/...`): 캡차 없음. 단축링크를 리다이렉트 1홉만
  따라가면(`redirect:"manual"`) `location` 헤더에서 `shareId`를 뽑을 수 있고,
  그걸로 `pages.map.naver.com/save-pages/api/maps-bookmark/v3/shares/{shareId}/bookmarks`
  JSON API를 로그인/쿠키 없이 직접 호출 가능. 이름/주소/좌표/**사진**/카테고리/
  정식 place ID(`sid`)까지 다 나옴 - 셋 중 데이터가 제일 풍부함. 단
  `placeInfo=true`(사진 포함)일 땐 `limit`이 20 넘으면 400 나서 20개씩
  페이지네이션 필요
- **구글** (`maps.app.goo.gl/...`): 캡차 없음. 최종 페이지 `<head>`에
  `<link rel="preload" as="fetch" href="/maps/preview/entitylist/getlist?...">`가
  미리 박혀있는데, 이 URL을 직접 호출하면 로그인 없이 JSON으로 목록이 나옴.
  단 이름/좌표만 있고 주소/사진/정식 place ID는 없음
- **카카오** (`kko.to/...`): 캡차 없음. `map.kakao.com/favorite/list?folderid={id}`가
  실제 API인데, **`Referer` 헤더가 폴더 페이지 URL이 아니면 403** - 이거 하나만
  맞추면 통과함. 좌표가 일반 위경도가 아니라 카카오 내부 좌표계("WCONGNAMUL")라
  `KAKAO_REST_API_KEY`로 카카오 공식 좌표변환 API(`transcoord.json`)를 태워야
  진짜 좌표가 나옴 - **지금 이 키가 없어서 카카오 폴더는 이름/주소만 나오고
  좌표는 비어있는 상태**(키 생기면 좌표까지 채워지도록 코드는 이미 되어있음)
- 셋 다 비공식 내부 엔드포인트라 서비스 측이 예고 없이 형식을 바꾸면 조용히
  깨질 수 있음 - 이건 감수하기로 함(코드 안에 이유 주석으로 남겨둠)

**"폴더 링크 가져오기" - 실제 기능 구현**

위 조사 결과를 실제 보드 화면에 붙임. 기존 "장소 추가" 모달의 링크 붙여넣기
입력창을 그대로 확장하는 방식으로 구현(별도 화면 안 만듦):

- `lib/parsers/placelist.ts` - URL이 개별 링크인지 폴더 링크인지 판별
  (`detectPlacelist`), 파서 3개(`{naver,google,kakao}Placelist.ts`)가 공유하는
  반환 타입(`PlacelistResult`: 장소 배열 + 총 개수 + 부분실패 여부) 정의
- `app/api/boards/[slug]/import-list/route.ts` - 폴더 링크 전용 라우트.
  개별 링크면 `{isPlacelist:false}`만 주고 끝(클라이언트가 기존 `/api/parse`로
  폴백) - 기존 단일 링크 파싱 경로는 전혀 안 건드림. 100개 캡, 보드에 이미
  있는 장소는 `sourceUrl` 비교로 중복 표시, 전용 레이트리밋(시간당 10회)
- `components/entry/ImportListPreview.tsx` - 사진 썸네일/이름/주소/카테고리/
  체크박스 미리보기, 전체선택 토글, 중복 항목 "이미 담김" 배지(기본 체크
  해제), 100개 캡 안내, 에러 시 재시도 버튼
- `PasteBox`/`AddEntryDialog`/`BoardDetailClient`를 확장해서 위 흐름을 연결.
  "선택한 장소 추가"는 기존 장소 추가 로직(`postEntry`)을 그대로 재사용해서
  순차로 여러 번 호출 - 보드당 50개 상한에 걸리면 거기까지 담고 에러 배너로
  알려줌(실제로 재현 테스트해서 확인함)
- `lib/types.ts`의 `Entry`/`ParsedPlace`에 `photos?: string[]` 추가(하위 호환 -
  없어도 기존 단일 링크 추가는 그대로 동작)
- **버그 하나 발견·수정**: 구글 폴더 판별 로직이 브라우저 UA 기준 URL 모양만
  잡고 있었는데, 실제 리다이렉트 추적에 쓰는 봇 UA는 다른 URL 모양으로
  도착해서 구글 폴더 링크가 전부 오판정되고 있었음 - dev 서버로 직접
  재현하다가 발견해서 수정
- Playwright로 실제 화면에서 붙여넣기 → 미리보기 → "선택한 장소 추가" →
  보드 반영까지, 그리고 50개 상한 초과 시나리오까지 전부 재현 확인함.
  타입체크/린트 통과

## 다음에 이어서 할 만한 것
- `KAKAO_REST_API_KEY`, `GOOGLE_PLACES_API_KEY`는 아직 비어있음(선택 사항 - 없어도
  URL 패턴 추출만으로 링크 파싱은 동작함). **카카오 폴더 가져오기는 이 키가 있어야
  좌표까지 완성됨** - 키 생기면 실제 값으로 좌표 변환이 맞게 나오는지 한 번 검증 필요
- 커스텀 도메인(예: spoon-note.com 등) 연결은 아직 안 함 - 필요하면 Vercel 프로젝트
  Settings → Domains에서 추가
- 구글 폴더 가져오기는 장소별 정식 ID/사진이 없어서, 재수입해도 중복 판정이 항상
  "중복 아님"으로 나옴(알려진 한계) - 필요해지면 이름+좌표 근사 매칭 등 추가 검토
- 세 폴더 파서 다 비공식 내부 API라 서비스 측 변경으로 언제든 깨질 수 있음 - 실제로
  안 되기 시작하면 이 워크로그의 조사 내용부터 다시 확인

## 프롬프트 5 — 보드 상세 화면에 랭킹 반영

프롬프트 3(엔티티 매칭 + saveCount 집계)에서 만든 canonical place 데이터를
실제 화면에 반영. `Entry.canonicalId`는 이미 엔트리 추가 시점에 저장돼 있어서,
보드 상세 페이지(`app/b/[slug]/page.tsx`)에서 엔트리들의 canonicalId를 모아
한 번에 `getSaveCounts()`(신규, `canonicalPlaceService.ts` - `db.getAll()`로
배치 조회)로 조회한 뒤 클라이언트 컴포넌트에 `saveCounts: Record<canonicalId, count>`로
내려주는 방식으로 구현. canonicalId가 없거나 카운트 조회에 없는 장소는 0으로
취급해서 뱃지를 숨김(요구사항 4).

- `MapView.tsx` - 마커에 "🔥 N" 뱃지를 얹은 커스텀 divIcon(`buildMarkerIcon`),
  `COMMUNITY.goldThreshold` 이상이면 마커 점 색도 금색으로 변경. 팝업에도 카운트 표시
- `EntryCard.tsx` - 소스 뱃지 옆에 찜 횟수 뱃지 추가, 임계값 이상이면 카드
  테두리/배경/제목 색을 금색 계열로 강조
- `RankableEntryList.tsx` - "인기순 보기" 체크박스 추가. 켜면 `entries`를
  건드리지 않고 렌더링용 배열만 찜 횟수 내림차순으로 정렬해서 보여줌
  (`onReorder` 호출 안 함 - 저장된 드래그 순서는 그대로 유지). 켜져 있는 동안은
  드래그를 꺼서(`dragEnabled`) "정렬 기준이 다른데 드래그로 순서를 바꾸는" 혼란
  방지
- 알려진 한계: `saveCounts`는 페이지 최초 로드 시점 서버에서 한 번만 조회한
  값이라, 같은 화면에서 새로 추가한 엔트리는 새로고침 전까지 뱃지가 안 붙음
  (요구사항에 실시간 갱신은 없었음 - 필요해지면 postEntry 응답에 카운트도
  같이 내려주는 방식으로 확장 가능)

**검증**: 로컬 dev 서버(기존에 떠있던 3001 포트 재사용)에서 보드 2개를
만들어 같은 카카오 place ID(가짜 숫자 ID)로 각각 엔트리를 추가 → 두 번째
추가 후 `canonicalId`가 동일하게 결정적으로 매칭되는 것 확인 → 보드 상세
페이지 HTML을 직접 떠서(`curl`) "🔥 2" 뱃지와 금색 클래스(`border-amber-300`,
`eab308`)가 실제로 렌더링되는 것 확인. 두 보드 삭제 후 `removePlaceSave`가
saveCount를 정확히 0으로 되돌리는 것까지 확인하고, 남은 canonical place
테스트 문서는 일회성 스크립트로 직접 삭제해서 정리. `npm run build`,
`npm run lint`, `npx vitest run`(27개 전부 통과) 확인 완료.

## 프롬프트 6·7 — 커뮤니티 피드 + 지역 랭킹 페이지

**전제 버그 발견·수정(프롬프트 7 요구사항 4에서 명시적으로 확인 요청한 부분)**:
지금까지 `entryService.addEntry`/`boardService.deleteBoard`가 보드의 visibility와
무관하게 canonical place saveCount를 무조건 집계하고 있었다 - 즉 비공개/링크공유
보드에 담은 장소도 커뮤니티 랭킹에 그대로 반영되는 버그였음. 아래처럼 고쳤다:

- `entryService.addEntry`: `board.visibility === "community"`일 때만
  `recordPlaceSave` 호출(canonicalId도 그때만 붙음) - 이제 비공개/링크공유
  보드 엔트리는 canonicalId 필드 자체가 없음
- `boardService.updateBoard`: visibility가 "community"로/에서 바뀌면
  `syncCanonicalCountsOnVisibilityChange`가 기존 엔트리들을 소급 반영한다 -
  비공개→커뮤니티 전환 시 아직 canonicalId 없는 엔트리를 새로 집계에 넣고,
  커뮤니티→비공개 전환 시 canonicalId를 떼면서 카운트를 되돌림. 둘 다
  fail-open(부가 기능이라 실패해도 visibility 변경 자체는 이미 끝난 뒤)
- `deleteBoard`는 원래도 `entry.canonicalId`가 없으면 스킵하는 구조라 위 변경만으로
  자연히 일관성이 맞음(추가 수정 불필요)

**canonical place에 지역(region) 필드 추가**: 지역 랭킹을 지역별로 걸러 보여주려면
canonical place가 자기 지역을 알아야 해서, `CanonicalPlace.region`을 새로 추가.
최초 생성 시점(`recordPlaceSave`)에 `lib/utils/region.ts`의 `extractRegion()`으로
주소에서 시/구 단위를 뽑아 한 번만 저장(장소는 이동 안 하니 이후 갱신 안 함).
`extractRegion`은 행정구역 DB 없이 "구/군으로 끝나는 토큰 우선, 없으면 시로
끝나는 토큰, 그마저 없으면 첫 토큰" 휴리스틱 - 정확한 행정동 경계가 아니라
피드/랭킹 필터용 근사치. 순수 함수라 `region.test.ts`로 단위 테스트.

**프롬프트 6 - 커뮤니티 피드** (`/community`):
- `feedService.listCommunityFeed(region?)` - visibility:"community" 보드를 모아
  각 보드의 엔트리를 조회(N+1, MVP 규모 전제)해서 카드에 필요한 대표사진(사진
  있는 첫 엔트리)/지역(엔트리 주소 최빈값, `dominantRegion`)/작성자
  닉네임/"이 중 N곳은 다른 사람도 찜함"(canonical saveCount가 임계값 이상인
  엔트리 수)을 계산. saveCounts는 전체 보드의 canonicalId를 모아 한 번만
  배치 조회(N+1 아님). 정렬은 최신순 고정, 지역 필터는 URL 쿼리(`?region=`)
- `FeedCard.tsx` - 카드 전체가 보드 상세로 가는 Link, 신고 버튼은 Link 안에
  button을 중첩하는 비표준 마크업 대신 절대위치 형제 요소로 분리
- 신고: `POST /api/boards/[slug]/report` -> `reportService.reportBoard()` ->
  `boardReports` 컬렉션에 기록만(중복 방지·사유 입력 없음, admin UI 없음 -
  관리자가 Firestore 콘솔에서 직접 확인하는 걸 전제). 레이트리밋만 추가
  (시간당 20회, 도배 방지 최소 수준)

**프롬프트 7 - 지역 랭킹** (`/rankings`):
- `canonicalPlaceService.listRankedPlaces(region)` - region으로만 where 걸고
  (saveCount 범위 조건까지 걸면 복합 색인 필요해져서 회피) saveCount>0 필터/
  내림차순 정렬은 메모리에서. saveCount 자체가 이미 커뮤니티 보드만 반영된
  값이라 별도 visibility 체크 불필요
- `listRegionsWithRankings()` - 드롭다운용 지역 목록, `select()`로 필요한
  필드만 읽어서 비용 절감
- `listBoardsForCanonicalPlace(id)` - 항목 펼쳤을 때 "이 장소를 찜한 보드
  목록"용, canonicalPlaces/{id}/boards 서브컬렉션 문서 ID가 boardId 그대로라
  바로 배치 조회 가능. `GET /api/canonical-places/[id]/boards`로 지연 조회
  (랭킹 목록 로드 시 전부 안 불러옴)
- `RankingList.tsx` - 1~3위 메달 이모지, 4위부터 숫자. 펼친 보드 목록은
  컴포넌트 내부에 캐시해서 접었다 펴도 재요청 안 함

**검증**: 로컬 dev 서버에서 커뮤니티 보드 2개(강남구, 같은 카카오ID로 매칭되는
장소 포함) + 비공개 보드 1개(같은 지역, 다른 장소)를 만들어 `/community`
HTML을 직접 확인 - 커뮤니티 보드만 노출, 지역/장소개수/작성자/"N곳은 다른
사람도 찜함" 문구 전부 정확히 렌더링, 비공개 보드는 피드에 전혀 안 나옴을
확인. `/rankings?region=강남구`에서 랭킹 정렬(🔥2 > 🔥1)과 비공개 보드
장소가 랭킹에서 완전히 빠지는 것 확인. `/api/canonical-places/[id]/boards`,
`POST /api/boards/[slug]/report` 둘 다 직접 호출해서 정상 동작 확인.
visibility 전환 시나리오(비공개로 엔트리 추가 → 커뮤니티로 전환 시
canonicalId가 소급 부여되고 saveCount 증가 → 다시 링크공유로 전환 시
canonicalId 제거되고 saveCount 원복)까지 전부 재현 확인. 테스트로 만든
보드/canonical place/신고 기록 전부 정리 완료. `npm run build`,
`npm run lint`, `npx vitest run`(36개 전부 통과) 확인 완료.

## 프롬프트 8 — "담아가기" 기능 (내 보드로 가져오기)

커뮤니티 피드/지역 랭킹에서 본 장소를 로그인 없이(ownerKey 로컬저장 모델 그대로)
내 보드로 옮길 수 있는 기능. 핵심은 "기존 장소 추가 로직 재사용"(요구사항 3) -
새 파이프라인을 만들지 않고 entryService.addEntry를 그대로 감싸는 방식으로 구현:

- **CanonicalPlace에 address/category/photos 스냅샷 추가** - 지역 랭킹 페이지의
  랭킹 항목은 이름/카운트만 들고 있어서, "담아가기"에 필요한 나머지 정보(주소/
  좌표/사진/카테고리/원본 링크)를 얻으려면 canonical place 자체가 가지고
  있어야 함. `recordPlaceSave`가 최초 등록 시점에 한 번만 저장(region과 동일한
  원칙 - 장소는 안 움직이니 이후 엔트리가 바뀌어도 갱신 안 함)
- `entryService.collectEntry(slug, input)` - addEntry 호출 전에 sourceUrl
  문자열 비교로 중복을 먼저 확인(import-list 라우트의 중복 판정과 동일 기준) -
  중복이면 `{status:"duplicate"}`, 아니면 addEntry 그대로 호출해서
  `{status:"added", entry}`. sourceUrl이 없는 장소(수동입력 등)는 판정 불가라
  항상 새로 추가
- `POST /api/boards/[slug]/collect` - 기존 entries POST 라우트와 거의 동일한
  모양이지만 collectEntry를 호출. rate limit은 addEntry 규칙 재사용
- `GET /api/canonical-places/[id]` - 랭킹 페이지 경로 전용, canonical place를
  CollectiblePlace 모양으로 변환해서 반환(source/sourceUrl은 sources[0] 대표값)
- `CollectModal.tsx` - 로컬에 저장된 "내 보드"(useOwnedBoards) 중 선택 또는
  "새 보드 만들기"(제목만 입력, visibility 기본값 unlisted) - 새 보드는
  `saveOwnerKey`로 즉시 로컬에 등록해서 "내 보드"에도 바로 나타남
- 버튼 배치: 보드 상세 화면은 board.visibility === "community"일 때만 각
  엔트리 카드에 노출(EntryCard -> RankableEntryList -> BoardDetailClient로
  onCollect prop 전달), 지역 랭킹은 각 항목 행에 항상 노출(랭킹 자체가 이미
  커뮤니티 데이터만 모아놓은 거라 별도 조건 불필요)
- **요구사항 4 확인**: "담아간 장소도 자동으로 찜 카운트에 포함되는지" - addEntry를
  그대로 재사용하는 구조라 프롬프트 7에서 만든 게이팅(커뮤니티공개 보드만
  집계)이 자연스럽게 그대로 적용됨. 즉 담아간 목적지 보드가 "커뮤니티공개"면
  카운트가 올라가고, "새 보드 만들기"(기본값 링크공유)로 담으면 안 올라감 -
  이건 버그가 아니라 프롬프트 7의 규칙이 일관되게 적용된 것(실제 E2E 테스트로
  두 케이스 다 확인함)

**전체 E2E 테스트(프롬프트 8 마지막 요구사항)**: 이 세션엔 브라우저 자동화 도구가
없어서 실제 화면 클릭 대신 로컬 dev 서버에 직접 API 호출을 순서대로 실행해서
동일한 흐름을 검증함(보드 만들기 → 커뮤니티공개 → 장소 추가 → 피드/랭킹에서
확인 → 다른 보드로 담아가기 → 중복 담기 방지 → 새 보드로 담아가기):
1. 커뮤니티공개 보드 생성 + 장소 추가(마포구) → canonicalId 정상 부여 확인
2. `/community` 피드에 지역(마포구)/작성자 닉네임 정상 노출, 비공개 보드는 안 보임(기존 확인 재검증)
3. `/rankings?region=마포구`에 해당 장소와 "담아가기" 버튼 노출 확인
4. 랭킹 경로로 장소 상세 조회(`GET /api/canonical-places/[id]`) → 주소/좌표/
   사진/카테고리까지 전부 정확히 복원되는 것 확인
5. 다른 커뮤니티 보드로 담기 → 같은 canonicalId로 매칭, saveCount 1→2 상승 확인
6. 같은 보드에 같은 장소 재담기 시도 → `{status:"duplicate"}` 정상 응답
7. "새 보드 만들기" 플로우(생성 + 즉시 담기) → 성공하지만 새 보드가 기본
   링크공유라 saveCount는 그대로(2) 유지되는 것까지 확인(요구사항 4의 정확한
   동작 재확인)
8. 테스트로 만든 보드 3개 + canonical place 1개 전부 정리, 최종 saveCount 0 확인

`npm run build`, `npm run lint`, `npx vitest run`(36개) 전부 통과.

**결론**: 프롬프트 3~8로 이어진 커뮤니티 기능(엔티티 매칭·카운트 집계 → 3단계
공개설정 → 보드 상세 랭킹 반영 → 커뮤니티 피드 → 지역 랭킹 → 담아가기)이
end-to-end로 정상 동작함을 확인. 중간에 프롬프트 7 작업 때 "비공개/링크공유
보드도 카운트에 반영되던" 버그를 발견해 수정했고, 이 수정이 프롬프트 8의
담아가기 기능과도 자연스럽게 맞물려 동작하는 것까지 검증 완료.

## 다른 PC(사무실 등)에서 이어서 작업할 때 체크리스트
- `git pull`(또는 처음이면 `gh repo clone chocoding0615/spoon-note`)로 코드는 받아짐
- **`.env.local`은 git에 안 올라감**(`.gitignore`) - Firebase 서비스 계정 키
  (`FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`)는 직접
  옮겨야 함. Vercel에 이미 등록은 돼있지만 Sensitive라 `vercel env pull`로는
  평문을 못 가져오니, USB 등으로 `.env.local` 파일 자체를 옮기는 게 제일 확실함
- `npm install` (node_modules도 git에 없음)
- 그 다음 `npm run dev`로 3001 포트에서 바로 이어서 작업 가능
