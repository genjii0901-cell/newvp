import { NextResponse } from "next/server";
import { requireAdmin, getPendingTotpSecret, verifyTotp, enableAdminTotp } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code : "";

  const secret = await getPendingTotpSecret();
  if (!secret) {
    return NextResponse.json({ ok: false, message: "先に2FAを設定してください。" }, { status: 400 });
  }
  if (!verifyTotp(code, secret)) {
    return NextResponse.json({ ok: false, message: "コードが正しくありません。" }, { status: 400 });
  }
  const ok = await enableAdminTotp();
  if (!ok) {
    return NextResponse.json({ ok: false, message: "有効化に失敗しました。" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
