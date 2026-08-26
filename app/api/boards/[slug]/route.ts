import { NextResponse, type NextRequest } from "next/server";
import { getViewableBoard, updateBoard, deleteBoard } from "@/lib/services/boardService";
import { OwnershipError, ValidationError } from "@/lib/services/errors";
import { OWNER_KEY_HEADER } from "@/lib/constants";
import type { Visibility } from "@/lib/types";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

const VISIBILITY_VALUES: Visibility[] = ["public", "unlisted", "private"];

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const ownerKey = request.nextUrl.searchParams.get("ownerKey") ?? undefined;

  try {
    const board = await getViewableBoard(slug, ownerKey);
    if (!board) return NextResponse.json({ error: "보드를 찾을 수 없어요." }, { status: 404 });
    return NextResponse.json({ board });
  } catch (error) {
    console.error("[boards] 조회 실패:", error);
    return NextResponse.json({ error: "보드를 불러오지 못했어요." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const ownerKey = request.headers.get(OWNER_KEY_HEADER);
  if (!ownerKey) return NextResponse.json({ error: "권한이 없어요." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  const data = (body ?? {}) as Record<string, unknown>;

  try {
    const board = await updateBoard(slug, ownerKey, {
      title: typeof data.title === "string" ? data.title : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
      theme: typeof data.theme === "string" ? data.theme : undefined,
      visibility: VISIBILITY_VALUES.includes(data.visibility as Visibility)
        ? (data.visibility as Visibility)
        : undefined,
    });
    if (!board) return NextResponse.json({ error: "보드를 찾을 수 없어요." }, { status: 404 });
    return NextResponse.json({ board });
  } catch (error) {
    if (error instanceof OwnershipError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[boards] 수정 실패:", error);
    return NextResponse.json({ error: "보드를 수정하지 못했어요." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const ownerKey = request.headers.get(OWNER_KEY_HEADER);
  if (!ownerKey) return NextResponse.json({ error: "권한이 없어요." }, { status: 401 });

  try {
    const deleted = await deleteBoard(slug, ownerKey);
    if (!deleted) return NextResponse.json({ error: "보드를 찾을 수 없어요." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof OwnershipError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("[boards] 삭제 실패:", error);
    return NextResponse.json({ error: "보드를 삭제하지 못했어요." }, { status: 500 });
  }
}
