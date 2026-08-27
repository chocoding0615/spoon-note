import { NextResponse } from "next/server";

// 임시 진단(§2026-08-27 이메일 인증 500 조사) - Vercel이 실제로 어떤 Node
// 런타임을 쓰는지 직접 확인하려고 추가. 원인 확정되면 제거할 것.
export async function GET() {
  let authImportOk = true;
  let authImportError = "";
  try {
    await import("firebase-admin/auth");
  } catch (error) {
    authImportOk = false;
    authImportError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  return NextResponse.json({
    nodeVersion: process.version,
    authImportOk,
    authImportError,
  });
}
