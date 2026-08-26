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

## 다음에 이어서 할 만한 것
- `KAKAO_REST_API_KEY`, `GOOGLE_PLACES_API_KEY`는 아직 비어있음(선택 사항 - 없어도
  URL 패턴 추출만으로 링크 파싱은 동작함)
- 커스텀 도메인(예: spoon-note.com 등) 연결은 아직 안 함 - 필요하면 Vercel 프로젝트
  Settings → Domains에서 추가
