import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json(
      { ok: false, message: "ADMIN_PASSWORD is not configured." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (password !== adminPassword) {
    return NextResponse.json(
      { ok: false, message: "管理者パスワードが違います。" },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}
