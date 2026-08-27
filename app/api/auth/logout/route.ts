import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export async function POST(request: NextRequest) {
  await destroySession();
  return NextResponse.redirect(new URL("/my", request.nextUrl.origin), { status: 303 });
}
