import { NextResponse } from "next/server";
import { ensureProfile, getSupabaseAdmin, readableError, requireSupabaseUser } from "@/lib/supabase/admin";

// Cancelling from the billing portal would bypass the account verification screen.
async function getPaymentsOnlyConfiguration(secret: string) {
  const endpoint = "https://api.stripe.com/v1/billing_portal/configurations";
  const headers = { Authorization: `Bearer ${secret}` };
  const list = await fetch(`${endpoint}?active=true&limit=100`, { headers, cache: "no-store" });
  if (!list.ok) throw new Error("請求ポータルの設定を確認できませんでした。");
  const { data } = await list.json() as { data: Array<{ id: string; metadata?: { vpp?: string }; features: { subscription_cancel?: { enabled?: boolean }; subscription_update?: { enabled?: boolean } } }> };
  const existing = data.find((entry) => entry.metadata?.vpp === "payments-only-v1"
    && entry.features.subscription_cancel?.enabled === false && entry.features.subscription_update?.enabled !== true);
  if (existing) return existing.id;

  const created = await fetch(endpoint, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": "vpp-payments-only-portal-v1" },
    body: new URLSearchParams({
      "features[invoice_history][enabled]": "true",
      "features[payment_method_update][enabled]": "true",
      "features[subscription_cancel][enabled]": "false",
      "features[subscription_update][enabled]": "false",
      "metadata[vpp]": "payments-only-v1",
    }),
  });
  const result = await created.json() as { id?: string };
  if (!created.ok || !result.id) throw new Error("安全な請求ポータルを準備できませんでした。");
  return result.id;
}

function isNoSuchCustomerError(value: unknown) {
  return typeof value === "string" && value.includes("No such customer");
}

export async function POST(request: Request) {
  try {
    const auth = await requireSupabaseUser(request);
    if (auth.response) return auth.response;

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vocabprint.com";

    if (!stripeSecretKey) {
      return NextResponse.json(
        { ok: false, error: "STRIPE_SECRET_KEY is not configured." },
        { status: 500 }
      );
    }

    const profile = await ensureProfile(auth.user);
    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { ok: false, error: "No Stripe customer is linked to this account yet." },
        { status: 400 }
      );
    }

    const body = new URLSearchParams({
      customer: profile.stripe_customer_id,
      configuration: await getPaymentsOnlyConfiguration(stripeSecretKey),
      return_url: `${appUrl}/pricing`,
    });

    const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = await response.json();
    if (!response.ok) {
      if (isNoSuchCustomerError(data.error?.message)) {
        const supabase = getSupabaseAdmin();
        await supabase
          .from("profiles")
          .update({ plan: "free", stripe_customer_id: null })
          .eq("id", auth.user.id);

        return NextResponse.json(
          {
            ok: false,
            error:
              "このアカウントの請求情報を開けませんでした。表示が古い可能性があるため、もう一度 Personal を開始し直してください。",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { ok: false, error: data.error?.message ?? "Failed to create billing portal session." },
        { status: response.status }
      );
    }

    return NextResponse.json({ ok: true, url: data.url });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: readableError(error) },
      { status: 500 }
    );
  }
}
