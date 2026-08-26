import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewableBoard } from "@/lib/services/boardService";
import { listEntries } from "@/lib/services/entryService";
import { BoardDetailClient } from "@/components/board/BoardDetailClient";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ownerKey?: string; view?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { ownerKey } = await searchParams;

  const board = await getViewableBoard(slug, ownerKey);
  if (!board) return { title: "보드를 찾을 수 없어요" };

  const entries = await listEntries(slug);
  const description = board.description || `장소 ${entries.length}개가 담긴 스푼노트 보드`;

  return {
    title: board.title,
    description,
    openGraph: { title: board.title, description, type: "website" },
  };
}

export default async function BoardDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { ownerKey, view } = await searchParams;

  const board = await getViewableBoard(slug, ownerKey);
  if (!board) notFound();

  const entries = await listEntries(slug);
  const isOwner = Boolean(ownerKey) && ownerKey === board.ownerKey;

  return (
    <BoardDetailClient
      board={board}
      initialEntries={entries}
      isOwner={isOwner}
      ownerKey={isOwner ? ownerKey : undefined}
      initialView={view === "map" ? "map" : "list"}
    />
  );
}
