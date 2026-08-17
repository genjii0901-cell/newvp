import { NextResponse } from "next/server";
import { getSupabaseAdmin, readableError, requireSupabaseUser } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("marketing_email_opt_in,marketing_email_opted_in_at")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, message: "メール配信設定の準備がまだ完了していません。" },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    marketingEmailOptIn: data?.marketing_email_opt_in === true,
    optedInAt: data?.marketing_email_opted_in_at ?? null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireSupabaseUser(request);
  if (auth.response) return auth.response;

  const body = (await request.json().catch(() => ({}))) as { marketingEmailOptIn?: unknown };
  if (typeof body.marketingEmailOptIn !== "boolean") {
    return NextResponse.json({ ok: false, message: "設定内容を確認してください。" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({
      marketing_email_opt_in: body.marketingEmailOptIn,
      marketing_email_opted_in_at: body.marketingEmailOptIn ? new Date().toISOString() : null,
    })
    .eq("id", auth.user.id);

  if (error) {
    return NextResponse.json({ ok: false, message: readableError(error) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, marketingEmailOptIn: body.marketingEmailOptIn });
}
