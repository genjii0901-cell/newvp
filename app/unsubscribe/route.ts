import { NextResponse } from "next/server";
import { verifyUnsubscribeRequest } from "@/lib/marketing-email";
import { getSupabaseAdmin, isSupabaseServerConfigured } from "@/lib/supabase/admin";

function page(title: string, message: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="ja"><meta charset="utf-8" /><title>${title}</title><body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a"><main style="max-width:560px;margin:80px auto;padding:24px"><section style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px"><h1 style="margin:0;font-size:22px">${title}</h1><p style="margin:16px 0 0;line-height:1.8;color:#475569">${message}</p><p style="margin:24px 0 0"><a href="/" style="color:#2563eb">Vocab Print Proへ戻る</a></p></section></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

async function unsubscribe(request: Request) {
  const url = new URL(request.url);
  const email = verifyUnsubscribeRequest(url.searchParams.get("e"), url.searchParams.get("s"));
  if (!email) return { ok: false, response: page("リンクが無効です", "配信停止リンクを確認してください。", 400) };
  if (!isSupabaseServerConfigured()) {
    return { ok: false, response: page("設定を変更できません", "しばらくしてからもう一度お試しください。", 503) };
  }

  const { error } = await getSupabaseAdmin()
    .from("profiles")
    .update({ marketing_email_opt_in: false, marketing_email_opted_in_at: null })
    .eq("email", email);
  if (error) return { ok: false, response: page("設定を変更できません", "しばらくしてからもう一度お試しください。", 500) };
  return { ok: true, response: page("配信を停止しました", "今後、Vocab Print Proのお知らせメールはお送りしません。") };
}

export async function GET(request: Request) {
  return (await unsubscribe(request)).response;
}

// Supports Gmail/Yahoo one-click unsubscribe requests without rendering a page.
export async function POST(request: Request) {
  const result = await unsubscribe(request);
  if (!result.ok) return new NextResponse(null, { status: 400 });
  return new NextResponse(null, { status: 200 });
}
