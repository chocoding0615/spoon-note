import { LoginButtons } from "@/components/auth/LoginButtons";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ClaimBoardsBanner } from "./ClaimBoardsBanner";
import type { SessionUser } from "@/lib/session";

const PROVIDER_BADGE: Record<SessionUser["provider"], { label: string; bg: string; fg: string }> = {
  kakao: { label: "카카오로 가입", bg: "#FEE500", fg: "#181600" },
  naver: { label: "네이버로 가입", bg: "#03C75A", fg: "#ffffff" },
  email: { label: "이메일로 가입", bg: "#e7e5e4", fg: "#57534e" },
};

interface AccountPanelProps {
  session: SessionUser | null;
  loginError?: boolean;
}

// chemi-map(C:\Users\admin\chemi-map) app/my/page.tsx의 로그인 전/후 분기
// 패턴을 스푼노트 톤으로 계승(§계정 설계안 07).
export function AccountPanel({ session, loginError }: AccountPanelProps) {
  if (!session) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-sm text-stone-500">
          로그인하면 보드를 계정에 연결해서 다른 기기에서도 이어서 관리할 수 있고, 커뮤니티공개로 전환할 수 있어요.
        </p>
        {loginError && <p className="mt-2 text-xs font-medium text-red-500">로그인에 실패했어요. 다시 시도해주세요.</p>}
        <div className="mt-4">
          <LoginButtons />
        </div>
      </div>
    );
  }

  const badge = PROVIDER_BADGE[session.provider];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-stone-900">{session.nickname}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: badge.bg, color: badge.fg }}
          >
            {badge.label}
          </span>
        </div>
        <LogoutButton />
      </div>
      <ClaimBoardsBanner />
    </div>
  );
}
