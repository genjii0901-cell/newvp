import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin, isSupabaseServerConfigured, readableError } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Finding = { level: "error" | "warn" | "ok" | "info"; text: string };

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function iso(seconds: unknown): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

async function stripeGet(path: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false as const, error: "STRIPE_SECRET_KEY が設定されていません。" };
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) return { ok: false as const, error: str(obj(body.error).message) ?? "Stripeの照会に失敗しました。" };
  return { ok: true as const, body };
}

async function findAuthUsers(email: string) {
  const supabase = getSupabaseAdmin();
  const matches: Array<Record<string, unknown>> = [];
  // メールで直接検索できないため、一覧を最大10ページ（1万件）まで走査する。
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      if ((user.email ?? "").toLowerCase() === email) {
        matches.push({
          id: user.id,
          email: user.email,
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at ?? null,
          emailConfirmedAt: user.email_confirmed_at ?? null,
          providers: Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : [],
        });
      }
    }
    if (data.users.length < 1000) break;
  }
  return matches;
}

export async function GET(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ ok: false, message: "Supabaseサーバー設定が未完了です。" }, { status: 503 });
  }

  const email = (new URL(request.url).searchParams.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, message: "メールアドレスの形式で入力してください。" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const findings: Finding[] = [];

    const authUsers = await findAuthUsers(email);
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id,email,plan,role,trial_used,stripe_customer_id")
      .ilike("email", email);
    const profiles = profileRows ?? [];
    const profile = profiles.find((row) => authUsers.some((user) => user.id === row.id)) ?? profiles[0] ?? null;

    let subscriptionRows: Array<Record<string, unknown>> = [];
    if (profile) {
      const { data } = await supabase
        .from("subscriptions")
        .select("stripe_subscription_id,status,plan,current_period_end,stripe_customer_id")
        .eq("user_id", profile.id);
      subscriptionRows = data ?? [];
    }

    // Stripe側: 登録メールと同じ顧客（別の顧客IDの可能性もあるため、メールでも探す）
    const customerIds = new Set<string>();
    if (profile?.stripe_customer_id) customerIds.add(String(profile.stripe_customer_id));
    const stripeErrors: string[] = [];
    const byEmail = await stripeGet(`customers?email=${encodeURIComponent(email)}&limit=10`);
    if (byEmail.ok) {
      const list = Array.isArray(byEmail.body.data) ? byEmail.body.data : [];
      for (const customer of list) {
        const id = str(obj(customer).id);
        if (id) customerIds.add(id);
      }
    } else {
      stripeErrors.push(byEmail.error);
    }

    const stripeSubscriptions: Array<Record<string, unknown>> = [];
    for (const customerId of customerIds) {
      const result = await stripeGet(`subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`);
      if (!result.ok) {
        stripeErrors.push(result.error);
        continue;
      }
      for (const item of Array.isArray(result.body.data) ? result.body.data : []) {
        const sub = obj(item);
        const metadata = obj(sub.metadata);
        stripeSubscriptions.push({
          id: str(sub.id),
          customerId,
          status: str(sub.status),
          plan: str(metadata.plan),
          cancelAtPeriodEnd: sub.cancel_at_period_end === true,
          currentPeriodEnd: iso(sub.current_period_end),
          trialEnd: iso(sub.trial_end),
          introPaidWeek: str(metadata.intro_paid_week) === "1",
        });
      }
    }

    // ---- 原因の推定（ルールベース。断定ではなく手がかり） ----
    if (authUsers.length === 0) {
      findings.push({ level: "error", text: "このメールアドレスでの会員登録が見つかりません。別のメールアドレス（Googleや別のアドレス）で登録した可能性があります。" });
    }
    if (authUsers.length > 1) {
      findings.push({ level: "warn", text: "同じメールアドレスのアカウントが複数あります。別の方法（Google・メール）で別々に登録された可能性があります。" });
    }
    for (const user of authUsers) {
      if (!user.emailConfirmedAt) {
        findings.push({ level: "error", text: "メール確認が完了していません。確認メールのリンクを開けていないため、ログインできない可能性があります。" });
      }
      if (!user.lastSignInAt) {
        findings.push({ level: "warn", text: "一度もログインした記録がありません。" });
      }
    }
    if (authUsers.length > 0 && !profile) {
      findings.push({ level: "error", text: "ログイン用アカウントはありますが、プロフィールがありません。プランが反映されない原因になります。" });
    }

    const paid = stripeSubscriptions.filter((sub) => sub.status === "active" || sub.status === "trialing");
    const activePaid = paid.filter((sub) => !(sub.status === "trialing" && sub.cancelAtPeriodEnd));
    if (stripeSubscriptions.length === 0 && customerIds.size === 0) {
      findings.push({ level: "info", text: "Stripe上に、このメールアドレスの契約・顧客が見つかりません。決済時に別のメールアドレスを入力した可能性があります。" });
    }
    if (activePaid.length > 0 && profile && profile.plan === "free") {
      findings.push({ level: "error", text: "Stripeでは契約中ですが、サイト上のプランが無料のままです（反映漏れの可能性）。決済後の通知（Webhook）が届いていないか、別のアカウントに紐づいている可能性があります。" });
    }
    if (activePaid.length > 0 && profile && profile.stripe_customer_id && !customerIds.has(String(profile.stripe_customer_id))) {
      findings.push({ level: "warn", text: "プロフィールのStripe顧客IDと、契約のある顧客IDが一致しません。" });
    }
    if (activePaid.length > 0 && profile && !profile.stripe_customer_id) {
      findings.push({ level: "warn", text: "Stripeに契約はありますが、プロフィールにStripe顧客IDが入っていません（紐づけ漏れの可能性）。" });
    }
    if (profile && profile.plan !== "free" && activePaid.length === 0 && profile.role !== "admin") {
      findings.push({ level: "warn", text: "サイト上は有料プランですが、Stripeに有効な契約がありません（解約・期限切れ・支払い失敗の可能性）。次にログインすると無料へ戻ります。" });
    }
    for (const sub of stripeSubscriptions) {
      if (sub.status === "past_due" || sub.status === "unpaid") {
        findings.push({ level: "error", text: "支払いが失敗しています（" + String(sub.status) + "）。カード情報の更新が必要です。" });
      }
      if (sub.status === "incomplete" || sub.status === "incomplete_expired") {
        findings.push({ level: "error", text: "決済が完了していません（" + String(sub.status) + "）。決済の途中で離脱した可能性があります。" });
      }
      if (sub.status === "trialing" && sub.cancelAtPeriodEnd) {
        findings.push({ level: "info", text: "7日間アクセス中に解約済みです。期間終了まで有効にならない扱いです（仕様）。" });
      }
    }
    if (activePaid.length > 0 && profile && profile.plan !== "free") {
      findings.push({ level: "ok", text: "契約とプランは一致しています。ログイン・端末・ブラウザ側の問題を確認してください（別のGoogleアカウントでログインしていないか等）。" });
    }
    if (findings.length === 0) {
      findings.push({ level: "info", text: "明確な不一致は見つかりませんでした。" });
    }

    return NextResponse.json(
      {
        ok: true,
        email,
        authUsers,
        profile: profile
          ? {
              id: profile.id,
              plan: profile.plan ?? "free",
              role: profile.role ?? "user",
              trialUsed: profile.trial_used === true,
              stripeCustomerId: profile.stripe_customer_id ?? null,
            }
          : null,
        siteSubscriptions: subscriptionRows,
        stripeSubscriptions,
        stripeErrors,
        findings,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json({ ok: false, message: readableError(error) }, { status: 500 });
  }
}
