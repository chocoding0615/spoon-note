"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/community", label: "커뮤니티", icon: "👥" },
  { href: "/my", label: "마이페이지", icon: "👤" },
];

interface BottomTabBarProps {
  /** 로그인 상태 반영(§프롬프트 10) - 마이페이지 탭 아이콘을 프로필 사진으로
   *  바꿔서 "지금 로그인돼 있다"를 탭 바만 보고도 알 수 있게 한다. */
  loggedIn: boolean;
  profileImageUrl: string | null;
}

export function BottomTabBar({ loggedIn, profileImageUrl }: BottomTabBarProps) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const showAvatar = tab.href === "/my" && loggedIn && profileImageUrl;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                active ? "text-accent" : "text-stone-400"
              }`}
            >
              <span className="relative flex h-6 w-6 items-center justify-center text-lg leading-none">
                {showAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 외부 도메인(소셜 프로필) 사진이라 next/image 최적화 대상이 아님
                  <img src={profileImageUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  tab.icon
                )}
                {tab.href === "/my" && loggedIn && !showAvatar && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />
                )}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
