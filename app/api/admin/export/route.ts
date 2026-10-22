import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { csvDateStamp, csvResponse, toCsv } from "@/lib/csv";
import { isSupabaseServerConfigured } from "@/lib/supabase/admin";
import { loadWordbooksForExport, wordbookListCsvRows, wordCsvRows } from "@/lib/wordbook-export";
import { GET as getMetrics } from "../metrics/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MetricsAccount = {
  id: string;
  email: string | null;
  created_at: string | null;
  role: string;
  plan: string;
  profilePlan?: string;
  subscriptionPlan?: string;
  stripeCustomerId?: string | null;
  hasProfile: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
};

type MetricsPdf = {
  id: string;
  created_at: string | null;
  type: string;
  word_count: number;
  wordbook_id: string | null;
  wordbook_title: string;
  user_id: string | null;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}

function japanTime(value: string | null | undefined) {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  return new Date(time + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
}

async function loadFullMetrics(request: Request) {
  const url = new URL("/api/admin/metrics?full=1", request.url);
  const response = await getMetrics(new Request(url, { headers: request.headers }));
  const body = (await response.json().catch(() => null)) as
    | { ok?: boolean; message?: string; accounts?: MetricsAccount[]; pdf?: { recent?: MetricsPdf[] } }
    | null;
  if (!response.ok || !body?.ok) throw new Error(body?.message ?? "集計データを取得できませんでした。");
  return body;
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  if (!isSupabaseServerConfigured()) return fail("Supabase が未設定のため出力できません。", 503);

  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const id = params.get("id")?.trim() || null;
  const stamp = csvDateStamp();

  try {
    if (kind === "wordbooks") {
      const { wordbooks } = await loadWordbooksForExport({ includeWords: false });
      return csvResponse(toCsv(wordbookListCsvRows(wordbooks)), `単語帳一覧_${stamp}.csv`);
    }

    if (kind === "words") {
      const { wordbooks } = await loadWordbooksForExport({ includeWords: true, id });
      if (id && wordbooks.length === 0) return fail("単語帳が見つかりません。", 404);
      const filename = id ? `${wordbooks[0].title}_単語一覧_${stamp}.csv` : `全単語帳_単語一覧_${stamp}.csv`;
      return csvResponse(toCsv(wordCsvRows(wordbooks, { includeBook: !id })), filename);
    }

    if (kind === "accounts") {
      const metrics = await loadFullMetrics(request);
      const rows = [
        ["ユーザーID", "メール", "実効プラン", "profilesプラン", "Stripeプラン", "購読状態", "次回更新日", "Stripe顧客ID", "role", "profiles", "登録日"],
        ...(metrics.accounts ?? []).map((account) => [
          account.id,
          account.email ?? "",
          account.plan,
          account.profilePlan ?? "",
          account.subscriptionPlan ?? "",
          account.subscriptionStatus ?? "",
          japanTime(account.currentPeriodEnd),
          account.stripeCustomerId ?? "",
          account.role,
          account.hasProfile ? "あり" : "未作成",
          japanTime(account.created_at),
        ]),
      ];
      return csvResponse(toCsv(rows), `アカウント一覧_${stamp}.csv`);
    }

    if (kind === "pdf-history") {
      const metrics = await loadFullMetrics(request);
      const rows = [
        ["日時", "単語帳ID", "単語帳名", "種類", "語数", "ユーザーID"],
        ...(metrics.pdf?.recent ?? []).map((item) => [
          japanTime(item.created_at),
          item.wordbook_id ?? "",
          item.wordbook_title,
          item.type,
          item.word_count,
          item.user_id ?? "",
        ]),
      ];
      return csvResponse(toCsv(rows), `PDF生成履歴_${stamp}.csv`);
    }

    return fail("kind は wordbooks / words / accounts / pdf-history のいずれかを指定してください。");
  } catch (error) {
    console.error("Admin CSV export failed", error);
    return fail(error instanceof Error ? error.message : "CSVを作成できませんでした。", 500);
  }
}
