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

## 다른 PC(사무실 등)에서 이어서 작업할 때 체크리스트
- `git pull`(또는 처음이면 `gh repo clone chocoding0615/spoon-note`)로 코드는 받아짐
- **`.env.local`은 git에 안 올라감**(`.gitignore`) - Firebase 서비스 계정 키
  (`FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`)는 직접
  옮겨야 함. Vercel에 이미 등록은 돼있지만 Sensitive라 `vercel env pull`로는
  평문을 못 가져오니, USB 등으로 `.env.local` 파일 자체를 옮기는 게 제일 확실함
- `npm install` (node_modules도 git에 없음)
- 그 다음 `npm run dev`로 3001 포트에서 바로 이어서 작업 가능
