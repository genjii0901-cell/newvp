import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function normalizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/")) return "/";
  return value;
}

function buildStatusUrl(request: NextRequest, message: string, next: string) {
  const url = new URL("/auth/callback", request.url);
  url.searchParams.set("status", "error");
  url.searchParams.set("message", message);
  url.searchParams.set("next", next);
  return url;
}

function formatAuthError(message: string) {
  if (message.toLowerCase().includes("pkce code verifier not found")) {
    return "確認リンクの有効期限が切れたか、別の環境で開かれた可能性があります。トップページからもう一度新規登録し、届いた最新の確認メールを開いてください。";
  }
  return message;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = normalizeNextPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(buildStatusUrl(request, "確認リンクに必要な情報が見つかりませんでした。", next));
  }

  const successUrl = new URL(next, request.url);
  successUrl.searchParams.set("auth", "confirmed");

  const response = NextResponse.redirect(successUrl);
  const supabase = await createServerSupabaseClient(response);

  if (!supabase) {
    return NextResponse.redirect(
      buildStatusUrl(request, "Supabase の環境変数が未設定のため、認証を完了できませんでした。", next),
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      buildStatusUrl(
        request,
        formatAuthError(
          error.message || "メール認証の完了に失敗しました。もう一度メール内のリンクを開いてください。",
        ),
        next,
      ),
    );
  }

  return response;
}
