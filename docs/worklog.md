# 작업 노트

세션이 바뀌어도 이어서 작업할 수 있게, 그날그날 한 작업을 여기 요약해둔다.
`CLAUDE.md`가 이 파일을 자동으로 불러오니 새 세션을 열면 자동으로 컨텍스트에
들어간다. 오래된 항목은 필요 없어지면 지워도 된다.

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

## 다른 PC(사무실 등)에서 이어서 작업할 때 체크리스트
- `git pull`(또는 처음이면 `gh repo clone chocoding0615/spoon-note`)로 코드는 받아짐
- **`.env.local`은 git에 안 올라감**(`.gitignore`) - Firebase 서비스 계정 키
  (`FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`)는 직접
  옮겨야 함. Vercel에 이미 등록은 돼있지만 Sensitive라 `vercel env pull`로는
  평문을 못 가져오니, USB 등으로 `.env.local` 파일 자체를 옮기는 게 제일 확실함
- `npm install` (node_modules도 git에 없음)
- 그 다음 `npm run dev`로 3001 포트에서 바로 이어서 작업 가능
