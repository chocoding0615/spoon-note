import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "스푼노트 | 흩어진 맛집 링크, 스푼노트에 다 모아",
    template: "%s | 스푼노트",
  },
  description:
    "네이버·카카오·구글 지도 링크를 붙여넣으면 하나의 보드(지도+리스트)에 모아, 링크 하나로 친구와 공유하는 맛집 리스트.",
  openGraph: {
    title: "스푼노트",
    description: "흩어진 맛집 링크, 스푼노트에 다 모아",
    siteName: "스푼노트",
    locale: "ko_KR",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">{children}</body>
    </html>
  );
}
