import Link from "next/link";
import { PasteBox } from "@/components/paste/PasteBox";
import { Button } from "@/components/ui/Button";
import { MyBoardsList } from "@/components/board/MyBoardsList";
import { AccountPanel } from "@/components/account/AccountPanel";
import { getSession } from "@/lib/session";
import { listBoardsByUserId } from "@/lib/services/boardService";

interface MyPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function MyBoardsPage({ searchParams }: MyPageProps) {
  const { error } = await searchParams;
  const session = await getSession();
  const accountBoards = session ? await listBoardsByUserId(session.uid) : [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="text-2xl font-bold text-stone-900">마이페이지</h1>

      <AccountPanel session={session} loginError={error === "login_failed"} />

      <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-500">지도 링크로 보드 만들기</h2>
        <PasteBox />
        <Link href="/boards/new" className="self-start">
          <Button variant="ghost">직접 보드 만들기</Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-500">내 보드</h2>
          <Link href="/boards/new" className="text-sm font-medium text-accent">
            + 새 보드
          </Link>
        </div>
        <MyBoardsList accountBoards={accountBoards} />
      </div>
    </main>
  );
}
