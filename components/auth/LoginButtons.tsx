// 순수 <a href="/api/auth/.../login">뿐이라 클라이언트 JS/SDK가 필요 없다
// (§chemi-map lib/session.ts 이식 - 서버 리다이렉트만으로 완결되는 구조).
// 이메일 로그인은 별도 폼이 필요해서 여기선 링크만 둔다.
export function LoginButtons() {
  return (
    <div className="flex w-full flex-col gap-2.5">
      <a
        href="/api/auth/kakao/login"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3 text-sm font-bold text-[#181600] transition active:scale-95"
      >
        카카오로 시작하기
      </a>
      <a
        href="/api/auth/naver/login"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#03C75A] py-3 text-sm font-bold text-white transition active:scale-95"
      >
        네이버로 시작하기
      </a>
      <a
        href="/login/email"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-50 active:scale-95"
      >
        이메일로 시작하기
      </a>
    </div>
  );
}
