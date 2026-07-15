import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeLocalRedirectPath } from "@/lib/safe-redirect";

function buildStatusUrl(request: NextRequest, message: string, next: string) {
  const url = new URL("/auth/callback", request.url);
  url.searchParams.set("status", "error");
  url.searchParams.set("message", message);
  url.searchParams.set("next", next);
  return url;
}

function shouldTreatAsConfirmed(message: string) {
  return message.toLowerCase().includes("pkce code verifier not found");
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = normalizeLocalRedirectPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      buildStatusUrl(request, "確認リンクに必要な情報が見つかりませんでした。", next)
    );
  }

  const successUrl = new URL(next, request.url);
  successUrl.searchParams.set("auth", "confirmed");

  const response = NextResponse.redirect(successUrl);
  const supabase = await createServerSupabaseClient(response);

  if (!supabase) {
    return NextResponse.redirect(
      buildStatusUrl(request, "Supabaseの設定が未完了のため、認証を完了できませんでした。", next)
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    if (shouldTreatAsConfirmed(error.message || "")) {
      return response;
    }

    return NextResponse.redirect(
      buildStatusUrl(
        request,
        error.message || "メール認証の完了に失敗しました。もう一度、最新のメール内リンクを開いてください。",
        next
      )
    );
  }

  return response;
}
