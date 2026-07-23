import { NextResponse } from "next/server";
import { readableError, requireSupabaseUser, tryEnsureProfile } from "@/lib/supabase/admin";

// 1ページあたりの単価（円）。
const PER_PAGE_PRICE_JPY = 50;
const MAX_PAGES = 50;

function isLiveStripeKey(value: string | undefined) {
  return Boolean(value && value.startsWith("sk_live_"));
}

function isProductionHost(appUrl: string) {
  try {
    const host = new URL(appUrl).hostname.toLowerCase();
    return host === "vocabprint.com" || host === "www.vocabprint.com";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    // 都度課金は「アカウントがある人」向け。未登録は先に登録してもらう。
    const auth = await requireSupabaseUser(request);
    if (auth.response) return auth.response;

    const { pages } = (await request.json().catch(() => ({}))) as { pages?: unknown };
    const pageCount = Math.max(1, Math.min(MAX_PAGES, Math.floor(Number(pages) || 0)));
    if (!pageCount) {
      return NextResponse.json({ ok: false, error: "ページ数が不正です。" }, { status: 400 });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

    if (!stripeSecretKey) {
      return NextResponse.json(
        { ok: false, error: "Stripe設定が未完了です。STRIPE_SECRET_KEY を設定してください。" },
        { status: 500 }
      );
    }
    if (isProductionHost(appUrl) && !isLiveStripeKey(stripeSecretKey)) {
      return NextResponse.json(
        { ok: false, error: "本番ドメインでは live Stripe key が必要です。" },
        { status: 503 }
      );
    }

    const profile = await tryEnsureProfile(auth.user);

    const body = new URLSearchParams({
      mode: "payment",
      // 支払い後に /print へ戻り、印刷を実行する。セッションIDで支払い済みを検証する。
      success_url: `${appUrl}/print?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/print?purchase=cancel`,
      client_reference_id: auth.user.id,
    });

    body.append("payment_method_types[]", "card");
    body.append("line_items[0][price_data][currency]", "jpy");
    body.append("line_items[0][price_data][unit_amount]", String(PER_PAGE_PRICE_JPY));
    body.append("line_items[0][price_data][product_data][name]", "英単語プリント 1ページ");
    body.append("line_items[0][quantity]", String(pageCount));
    // 次回以降の自動決済のためカードを保存する。
    body.append("payment_intent_data[setup_future_usage]", "off_session");
    body.append("metadata[user_id]", auth.user.id);
    body.append("metadata[kind]", "print_purchase");
    body.append("metadata[pages]", String(pageCount));

    if (profile?.stripe_customer_id) {
      body.append("customer", profile.stripe_customer_id);
    } else if (auth.user.email) {
      body.append("customer_email", auth.user.email);
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: data.error?.message ?? "決済セッションを作成できませんでした。" },
        { status: response.status }
      );
    }

    return NextResponse.json({ ok: true, url: data.url, pages: pageCount, amount: pageCount * PER_PAGE_PRICE_JPY });
  } catch (error) {
    return NextResponse.json({ ok: false, error: readableError(error) }, { status: 500 });
  }
}
